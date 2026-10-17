export interface ParsedCurl {
  url: string
  method: string
  headers: Record<string, string>
  body: string
  cookies?: string
}

/**
 * Tokenize a command-line string respecting single and double quotes and escaped characters.
 */
function tokenizeArgs(cmd: string): string[] {
  // Normalize escaped newlines (e.g. trailing backslash on line continuation)
  const normalized = cmd.replace(/\\\r?\n/g, ' ')
  const tokens: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let escapeNext = false

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]

    if (escapeNext) {
      current += char
      escapeNext = false
      continue
    }

    if (char === '\\' && !inSingleQuote) {
      escapeNext = true
      continue
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (/\s/.test(char) && !inSingleQuote && !inDoubleQuote) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (current.length > 0) {
    tokens.push(current)
  }

  return tokens
}

/**
 * Parse a standard or complex cURL command (including -H, -b cookies, -d data, -X method, URLs).
 */
export function parseCurlCommand(rawCmd: string): ParsedCurl {
  const trimmed = rawCmd.trim()
  const tokens = tokenizeArgs(trimmed)

  let url = ''
  let method = ''
  const headers: Record<string, string> = {}
  let body = ''
  let cookies = ''

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    // Skip the curl binary name
    if (i === 0 && (token.toLowerCase() === 'curl' || token.toLowerCase().endsWith('/curl'))) {
      continue
    }

    // Method: -X, --request
    if (token === '-X' || token === '--request') {
      if (i + 1 < tokens.length) {
        method = tokens[++i].toUpperCase()
      }
      continue
    }

    // Headers: -H, --header
    if (token === '-H' || token === '--header') {
      if (i + 1 < tokens.length) {
        const headerStr = tokens[++i]
        const colonIdx = headerStr.indexOf(':')
        if (colonIdx > 0) {
          const key = headerStr.slice(0, colonIdx).trim()
          const val = headerStr.slice(colonIdx + 1).trim()
          headers[key] = val
        }
      }
      continue
    }

    // Cookies: -b, --cookie
    if (token === '-b' || token === '--cookie') {
      if (i + 1 < tokens.length) {
        cookies = tokens[++i]
        headers['Cookie'] = cookies
      }
      continue
    }

    // Body: -d, --data, --data-raw, --data-binary, --data-ascii, --data-urlencode
    if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary' ||
      token === '--data-ascii' ||
      token === '--data-urlencode'
    ) {
      if (i + 1 < tokens.length) {
        const dataVal = tokens[++i]
        body = body ? `${body}&${dataVal}` : dataVal
        if (!method) method = 'POST'
      }
      continue
    }

    // User authentication: -u, --user
    if (token === '-u' || token === '--user') {
      if (i + 1 < tokens.length) {
        const userPass = tokens[++i]
        try {
          const encoded = btoa(userPass)
          headers['Authorization'] = `Basic ${encoded}`
        } catch {
          // Ignore encoding errors
        }
      }
      continue
    }

    // URL detection (arguments without leading dash)
    if (!token.startsWith('-') && !url) {
      // Strip potential enclosing quotes
      const cleanUrl = token.replace(/^['"]|['"]$/g, '')
      if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
        url = cleanUrl
      }
    }
  }

  // Fallback URL regex if tokenizer did not catch it
  if (!url) {
    const urlMatch = trimmed.match(/https?:\/\/[^\s'")]+/i)
    if (urlMatch) {
      url = urlMatch[0]
    }
  }

  if (!method) {
    method = body ? 'POST' : 'GET'
  }

  return {
    url,
    method,
    headers,
    body,
    cookies
  }
}

/**
 * Generate formatted, clean Axios JavaScript/TypeScript code from ParsedCurl.
 */
export function curlToAxios(parsed: ParsedCurl): string {
  const method = (parsed.method || 'GET').toLowerCase()
  const hasHeaders = Object.keys(parsed.headers).length > 0
  const hasBody = Boolean(parsed.body)

  const headerLines = hasHeaders
    ? Object.entries(parsed.headers)
        .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
        .join(',\n')
    : ''

  let dataVal = 'undefined'
  if (hasBody) {
    try {
      // If it's valid JSON, format as object literal
      JSON.parse(parsed.body)
      dataVal = parsed.body
    } catch {
      dataVal = JSON.stringify(parsed.body)
    }
  }

  let code = `import axios from 'axios'\n\n`
  code += `async function executeRequest() {\n`
  code += `  try {\n`
  code += `    const response = await axios({\n`
  code += `      method: '${method}',\n`
  code += `      url: '${parsed.url}',\n`

  if (hasHeaders) {
    code += `      headers: {\n${headerLines}\n      },\n`
  }

  if (hasBody) {
    code += `      data: ${dataVal}\n`
  }

  code += `    })\n\n`
  code += `    console.log('Status:', response.status)\n`
  code += `    console.log('Data:', response.data)\n`
  code += `    return response.data\n`
  code += `  } catch (error) {\n`
  code += `    console.error('Request failed:', error)\n`
  code += `    throw error\n`
  code += `  }\n`
  code += `}\n\n`
  code += `executeRequest()`

  return code
}

/**
 * Convert structured request options into an executable, formatted cURL command.
 */
export function axiosToCurl(opts: {
  method?: string
  url: string
  headers?: Record<string, string>
  body?: string
}): string {
  const method = (opts.method || 'GET').toUpperCase()
  let curl = `curl '${opts.url}'`

  if (method !== 'GET') {
    curl += ` \\\n  -X ${method}`
  }

  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      if (!v) continue
      if (k.toLowerCase() === 'cookie') {
        curl += ` \\\n  -b '${v.replace(/'/g, "'\\''")}'`
      } else {
        curl += ` \\\n  -H '${k}: ${v.replace(/'/g, "'\\''")}'`
      }
    }
  }

  if (opts.body && method !== 'GET' && method !== 'HEAD') {
    curl += ` \\\n  --data-raw '${opts.body.replace(/'/g, "'\\''")}'`
  }

  return curl
}

/**
 * Generate native browser fetch() code from ParsedCurl.
 */
export function curlToFetch(parsed: ParsedCurl): string {
  const method = (parsed.method || 'GET').toUpperCase()
  const hasHeaders = Object.keys(parsed.headers).length > 0
  const hasBody = Boolean(parsed.body) && method !== 'GET' && method !== 'HEAD'

  const headerLines = hasHeaders
    ? Object.entries(parsed.headers)
        .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
        .join(',\n')
    : ''

  let code = `const response = await fetch('${parsed.url}', {\n`
  code += `  method: '${method}',\n`

  if (hasHeaders) {
    code += `  headers: {\n${headerLines}\n  },\n`
  }

  if (hasBody) {
    code += `  body: ${JSON.stringify(parsed.body)}\n`
  }

  code += `})\n`
  code += `const data = await response.json()\n`
  code += `console.log(data)`

  return code
}
