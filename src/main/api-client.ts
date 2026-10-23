import { ipcMain, type WebContents } from 'electron'
import http from 'node:http'
import https from 'node:https'
import zlib from 'node:zlib'
import { URL } from 'node:url'

export interface ApiRequestInput {
  id: string
  method: string
  url: string
  headers: Record<string, string>
  body?: string
}

export interface ApiResponseOutput {
  status: number
  statusText: string
  url: string
  headers: Record<string, string>
  body: string
  durationMs: number
  sizeBytes: number
  truncated: boolean
}

const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
const requests = new Map<string, { controller: AbortController; sender: WebContents }>()
const maxBodyBytes = 2 * 1024 * 1024
const maxResponseBytes = 5 * 1024 * 1024

function parseHttpUrl(value: string): URL {
  const url = new URL(value)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new Error('Enter an HTTP or HTTPS URL without credentials in the address.')
  }
  return url
}

function validate(input: ApiRequestInput): ApiRequestInput {
  if (!input || typeof input !== 'object') throw new Error('Invalid API request.')
  if (typeof input.id !== 'string' || !/^[\w-]{1,80}$/.test(input.id)) {
    throw new Error('Invalid request ID.')
  }
  const method = String(input.method || '').toUpperCase()
  if (!methods.has(method)) throw new Error('Choose a supported HTTP method.')
  if (typeof input.url !== 'string') throw new Error('Enter a request URL.')
  const url = parseHttpUrl(input.url.trim())
  const body = typeof input.body === 'string' ? input.body : ''
  if (Buffer.byteLength(body) > maxBodyBytes) throw new Error('Request body exceeds 2 MB.')
  if ((method === 'GET' || method === 'HEAD') && body) {
    throw new Error(`${method} requests cannot include a body.`)
  }
  if (!input.headers || typeof input.headers !== 'object' || Array.isArray(input.headers)) {
    throw new Error('Headers must be key-value pairs.')
  }
  const headers: Record<string, string> = {}
  const autoHeaders = new Set(['host', 'content-length', 'connection'])

  for (const [name, rawValue] of Object.entries(input.headers)) {
    const trimmedName = name.trim()
    if (!trimmedName) continue

    // Handle HTTP/2 pseudo-headers (e.g. copied from Chrome DevTools)
    if (trimmedName.startsWith(':')) {
      if (trimmedName.toLowerCase() === ':authority' && !headers['Host']) {
        const val = typeof rawValue === 'string' ? rawValue.replace(/[\r\n]+/g, ' ').trim() : String(rawValue)
        headers['Host'] = val
      }
      // Silently skip other HTTP/2 pseudo-headers (:method, :path, :scheme)
      continue
    }

    // Silently skip automatic headers instead of throwing validation errors
    if (autoHeaders.has(trimmedName.toLowerCase())) continue

    const value = typeof rawValue === 'string' ? rawValue.replace(/[\r\n]+/g, ' ').trim() : String(rawValue)
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(trimmedName)) {
      throw new Error(`Invalid header name: ${trimmedName}`)
    }
    // Strip control characters outside printable range to avoid Node ERR_INVALID_CHAR
    const sanitizedValue = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    headers[trimmedName] = sanitizedValue
  }

  return { id: input.id, method, url: url.toString(), headers, body }
}

interface NodeResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  sizeBytes: number
  truncated: boolean
  location?: string
}

function executeNodeRequest(
  targetUrl: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  controller: AbortController
): Promise<NodeResponse> {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(targetUrl)
      const isHttps = parsedUrl.protocol === 'https:'
      const client = isHttps ? https : http

      const reqHeaders = { ...headers }

      // Set default User-Agent if not provided
      if (!Object.keys(reqHeaders).some((k) => k.toLowerCase() === 'user-agent')) {
        reqHeaders['User-Agent'] =
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
      }

      // Add Accept-Encoding for automated decompression
      if (!Object.keys(reqHeaders).some((k) => k.toLowerCase() === 'accept-encoding')) {
        reqHeaders['Accept-Encoding'] = 'gzip, deflate, br'
      }

      if (body && method !== 'GET' && method !== 'HEAD') {
        reqHeaders['Content-Length'] = String(Buffer.byteLength(body))
      }

      const req = client.request(
        parsedUrl,
        {
          method,
          headers: reqHeaders,
          signal: controller.signal
        },
        (res) => {
          const rawHeaders = res.headers
          const outHeaders: Record<string, string> = {}
          for (const [k, v] of Object.entries(rawHeaders)) {
            if (v === undefined) continue
            outHeaders[k] = Array.isArray(v) ? v.join(', ') : v
          }

          let stream: NodeJS.ReadableStream = res
          const encoding = (res.headers['content-encoding'] || '').toLowerCase()
          try {
            if (encoding === 'gzip') {
              stream = res.pipe(zlib.createGunzip())
            } else if (encoding === 'deflate') {
              stream = res.pipe(zlib.createInflate())
            } else if (encoding === 'br') {
              stream = res.pipe(zlib.createBrotliDecompress())
            }
          } catch {
            // If decompressor creation fails, fallback to raw stream
            stream = res
          }

          const chunks: Buffer[] = []
          let totalBytes = 0
          let truncated = false

          stream.on('data', (chunk: Buffer) => {
            if (truncated) return
            const remaining = maxResponseBytes - totalBytes
            if (chunk.length > remaining) {
              if (remaining > 0) chunks.push(chunk.subarray(0, remaining))
              totalBytes += remaining
              truncated = true
              if ('destroy' in res && typeof res.destroy === 'function') {
                res.destroy()
              }
            } else {
              chunks.push(chunk)
              totalBytes += chunk.length
            }
          })

          stream.on('end', () => {
            const contentType = (outHeaders['content-type'] || '').toLowerCase()
            const isBinary =
              contentType.startsWith('image/') ||
              contentType.startsWith('audio/') ||
              contentType.startsWith('video/') ||
              contentType.includes('application/octet-stream') ||
              contentType.includes('application/pdf') ||
              contentType.includes('application/zip') ||
              contentType.includes('application/gzip')

            let fullBody = ''
            if (isBinary) {
              const fullBuffer = Buffer.concat(chunks)
              const previewLength = Math.min(fullBuffer.length, 64 * 1024)
              fullBody = `[Binary Content: ${totalBytes} bytes, Content-Type: ${contentType || 'unknown'}]\nBase64 Preview: data:${contentType || 'application/octet-stream'};base64,${fullBuffer.subarray(0, previewLength).toString('base64')}`
            } else {
              fullBody = Buffer.concat(chunks).toString('utf8')
            }

            const locationHeader = res.headers['location']
            resolve({
              status: res.statusCode || 200,
              statusText: res.statusMessage || 'OK',
              headers: outHeaders,
              body: fullBody,
              sizeBytes: totalBytes,
              truncated,
              location: Array.isArray(locationHeader) ? locationHeader[0] : locationHeader
            })
          })

          stream.on('error', (err) => {
            if (chunks.length > 0) {
              // Partial response received before error
              const fullBody = Buffer.concat(chunks).toString('utf8')
              resolve({
                status: res.statusCode || 200,
                statusText: res.statusMessage || 'OK',
                headers: outHeaders,
                body: fullBody,
                sizeBytes: totalBytes,
                truncated: true
              })
            } else {
              reject(err)
            }
          })
        }
      )

      req.on('error', (err) => {
        reject(err)
      })

      if (body && method !== 'GET' && method !== 'HEAD') {
        req.write(body)
      }
      req.end()
    } catch (err) {
      reject(err)
    }
  })
}

export function initApiClient(): void {
  ipcMain.handle(
    'api-send-request',
    async (event, raw: ApiRequestInput): Promise<ApiResponseOutput> => {
      const input = validate(raw)
      const key = `${event.sender.id}:${input.id}`
      if (requests.has(key)) throw new Error('This request is already running.')
      const controller = new AbortController()
      requests.set(key, { controller, sender: event.sender })
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, 30_000)
      const abortOnSenderClose = (): void => controller.abort()
      event.sender.once('destroyed', abortOnSenderClose)

      const start = performance.now()
      let currentUrl = input.url
      let method = input.method
      let body = input.body
      const headers = { ...input.headers }

      try {
        for (let redirect = 0; redirect <= 5; redirect++) {
          const res = await executeNodeRequest(currentUrl, method, headers, body, controller)

          const location = res.location
          if ([301, 302, 303, 307, 308].includes(res.status) && location) {
            let next: URL | undefined
            try {
              next = parseHttpUrl(new URL(location, currentUrl).toString())
            } catch {
              // Show an invalid or non-HTTP Location instead of following it.
            }

            if (
              next &&
              (next.origin === new URL(currentUrl).origin ||
                next.hostname === new URL(currentUrl).hostname)
            ) {
              if (redirect === 5) throw new Error('Too many redirects (maximum 5).')
              if (
                res.status === 303 ||
                ((res.status === 301 || res.status === 302) && method === 'POST')
              ) {
                method = 'GET'
                body = ''
              }
              currentUrl = next.toString()
              continue
            }
          }

          return {
            status: res.status,
            statusText: res.statusText,
            url: currentUrl,
            headers: res.headers,
            body: res.body,
            durationMs: Math.round(performance.now() - start),
            sizeBytes: res.sizeBytes,
            truncated: res.truncated
          }
        }
        throw new Error('Too many redirects.')
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error(timedOut ? 'Request timed out after 30 seconds.' : 'Request cancelled.')
        }
        throw error
      } finally {
        clearTimeout(timer)
        event.sender.off('destroyed', abortOnSenderClose)
        requests.delete(key)
      }
    }
  )

  ipcMain.on('api-cancel-request', (event, id: string) => {
    if (typeof id !== 'string') return
    const active = requests.get(`${event.sender.id}:${id}`)
    if (active?.sender === event.sender) active.controller.abort()
  })
}
