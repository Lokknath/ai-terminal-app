import { ipcMain, net, type WebContents } from 'electron'

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
  for (const [name, value] of Object.entries(input.headers)) {
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
      typeof value !== 'string' ||
      /[\r\n]/.test(value)
    ) {
      throw new Error(`Invalid header: ${name}`)
    }
    if (['host', 'content-length', 'connection'].includes(name.toLowerCase())) {
      throw new Error(`${name} is set automatically by the network client.`)
    }
    headers[name] = value
  }
  return { id: input.id, method, url: url.toString(), headers, body }
}

async function readLimitedResponse(
  response: Response,
  controller: AbortController
): Promise<{
  body: string
  sizeBytes: number
  truncated: boolean
}> {
  if (!response.body) return { body: '', sizeBytes: 0, truncated: false }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let sizeBytes = 0
  let truncated = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const remaining = maxResponseBytes - sizeBytes
      if (value.length > remaining) {
        if (remaining > 0) chunks.push(value.subarray(0, remaining))
        sizeBytes += remaining
        truncated = true
        break
      }
      chunks.push(value)
      sizeBytes += value.length
    }
  } finally {
    if (truncated) {
      await reader.cancel().catch(() => undefined)
      controller.abort()
    }
    reader.releaseLock()
  }
  return { body: new TextDecoder().decode(Buffer.concat(chunks)), sizeBytes, truncated }
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
          const response = await net.fetch(currentUrl, {
            method,
            headers,
            body: body && method !== 'GET' && method !== 'HEAD' ? body : undefined,
            credentials: 'omit',
            redirect: 'manual',
            signal: controller.signal
          })
          const location = response.headers.get('location')
          if ([301, 302, 303, 307, 308].includes(response.status) && location) {
            let next: URL | undefined
            try {
              next = parseHttpUrl(new URL(location, currentUrl).toString())
            } catch {
              // Show an invalid or non-HTTP Location instead of following it.
            }
            // A different origin could receive custom API keys or a POST body.
            // Return its redirect response so the user can review the destination.
            if (next?.origin === new URL(currentUrl).origin) {
              if (redirect === 5) throw new Error('Too many redirects (maximum 5).')
              if (
                response.status === 303 ||
                ((response.status === 301 || response.status === 302) && method === 'POST')
              ) {
                method = 'GET'
                body = ''
              }
              currentUrl = next.toString()
              continue
            }
          }
          const content = await readLimitedResponse(response, controller)
          return {
            status: response.status,
            statusText: response.statusText,
            url: currentUrl,
            headers: Object.fromEntries(response.headers.entries()),
            body: content.body,
            durationMs: Math.round(performance.now() - start),
            sizeBytes: content.sizeBytes,
            truncated: content.truncated
          }
        }
        throw new Error('Too many redirects.')
      } catch (error) {
        if (controller.signal.aborted)
          throw new Error(timedOut ? 'Request timed out after 30 seconds.' : 'Request cancelled.')
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
