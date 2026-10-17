import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Braces,
  Clock3,
  Code2,
  Copy,
  FileCode,
  History,
  LoaderCircle,
  Play,
  Plus,
  Save,
  Send,
  Terminal,
  Trash2,
  X
} from 'lucide-react'
import type { ApiResponseOutput } from '../../../preload/index'
import {
  parseCurlCommand,
  curlToAxios,
  axiosToCurl,
  curlToFetch,
  type ParsedCurl
} from '../utils/curl-converter'

interface SavedRequest {
  id: string
  name: string
  method: string
  url: string
  headers: string
  body: string
}

interface HistoryItem {
  id: string
  method: string
  url: string
  status: number
  durationMs: number
  at: number
}

const savedKey = 'nexus-api-saved-v1'
const historyKey = 'nexus-api-history-v1'
const privateHeader = /^(authorization|cookie|proxy-authorization|x-api-key)\s*:/i

function safeHistoryUrl(value: string): string {
  const parsed = new URL(value)
  // Query strings and fragments can contain secrets under arbitrary names.
  // History keeps the endpoint only; saved templates are a separate explicit action.
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

function readArray<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function parseHeaders(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const colon = line.indexOf(':')
    if (colon <= 0) throw new Error(`Header needs a name and value: ${line}`)
    const name = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    if (!name || /[\r\n]/.test(value)) throw new Error(`Invalid header: ${name}`)
    result[name] = value
  }
  return result
}

function prettyBody(body: string, contentType = ''): string {
  if (!/json/i.test(contentType) && !['{', '['].includes(body.trimStart()[0])) return body
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return '#4caf50'
  if (status >= 300 && status < 400) return '#38bdf8'
  if (status >= 400 && status < 500) return '#ff9800'
  return '#f44336'
}

export default function ApiWorkspace(): JSX.Element {
  const [method, setMethod] = useState('GET')
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState('')
  const [body, setBody] = useState('')
  const [saved, setSaved] = useState<SavedRequest[]>(() => readArray(savedKey))
  const [history, setHistory] = useState<HistoryItem[]>(() => readArray(historyKey))
  const [response, setResponse] = useState<ApiResponseOutput | null>(null)
  const [responseTab, setResponseTab] = useState<'body' | 'headers' | 'axios' | 'curl' | 'fetch'>('body')
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeRequestRef = useRef<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [importCurlText, setImportCurlText] = useState('')

  const getParsedCurlCurrent = (): ParsedCurl => {
    let parsedHeaders: Record<string, string> = {}
    try {
      parsedHeaders = parseHeaders(headers)
    } catch {
      // ignore
    }
    return {
      method,
      url,
      headers: parsedHeaders,
      body
    }
  }

  const copyAsCurl = async (): Promise<void> => {
    setError('')
    if (!url.trim()) {
      setError('Enter a URL first to generate a cURL command.')
      return
    }
    let parsedHeaders: Record<string, string> = {}
    try {
      parsedHeaders = parseHeaders(headers)
    } catch {
      // ignore
    }
    const curl = axiosToCurl({ method, url: url.trim(), headers: parsedHeaders, body })
    try {
      await window.api.writeClipboardText(curl)
      setNotice('cURL command copied to clipboard.')
    } catch {
      setError('Failed to copy cURL command.')
    }
  }

  const copyAsAxios = async (): Promise<void> => {
    setError('')
    if (!url.trim()) {
      setError('Enter a URL first to generate Axios code.')
      return
    }
    const snippet = curlToAxios(getParsedCurlCurrent())
    try {
      await window.api.writeClipboardText(snippet)
      setNotice('Axios snippet copied to clipboard.')
    } catch {
      setError('Failed to copy Axios snippet.')
    }
  }

  const handleImportCurl = (runAfterImport = false): void => {
    if (!importCurlText.trim()) {
      setError('Please paste a cURL command or Axios configuration.')
      return
    }
    try {
      const parsed = parseCurlCommand(importCurlText.trim())
      if (!parsed.url) {
        throw new Error('Could not detect a valid URL in the pasted command.')
      }
      setMethod(parsed.method || 'GET')
      setUrl(parsed.url)
      const headerStr = Object.entries(parsed.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
      setHeaders(headerStr)
      setBody(parsed.body || '')
      setShowImportModal(false)
      setImportCurlText('')
      setNotice('cURL request parsed and loaded into API Studio.')
      if (runAfterImport) {
        setTimeout(() => void send(parsed.url, parsed.method, parsed.headers, parsed.body), 100)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse cURL command.')
    }
  }

  useEffect(
    () => () => {
      if (activeRequestRef.current) window.api.cancelApiRequest(activeRequestRef.current)
    },
    []
  )

  const send = async (
    overrideUrl?: string,
    overrideMethod?: string,
    overrideHeaders?: Record<string, string>,
    overrideBody?: string
  ): Promise<void> => {
    if (activeRequestRef.current) return
    setError('')
    setNotice('')
    setResponse(null)
    let requestId = ''
    try {
      const targetUrl = (overrideUrl !== undefined ? overrideUrl : url).trim()
      const targetMethod = (overrideMethod !== undefined ? overrideMethod : method).toUpperCase()
      const targetBody = overrideBody !== undefined ? overrideBody : body
      const parsed = new URL(targetUrl)
      if (!['http:', 'https:'].includes(parsed.protocol))
        throw new Error('Use an HTTP or HTTPS URL.')
      const parsedHeaders = overrideHeaders || parseHeaders(headers)
      if (
        targetBody.trim() &&
        /application\/json/i.test(
          parsedHeaders['Content-Type'] || parsedHeaders['content-type'] || ''
        )
      ) {
        try {
          JSON.parse(targetBody)
        } catch {
          throw new Error('The JSON request body is invalid.')
        }
      }
      requestId = crypto.randomUUID()
      activeRequestRef.current = requestId
      setActiveId(requestId)
      const result = await window.api.sendApiRequest({
        id: requestId,
        method: targetMethod,
        url: parsed.toString(),
        headers: parsedHeaders,
        body: targetBody
      })
      setResponse(result)
      setResponseTab('body')
      const next = [
        {
          id: crypto.randomUUID(),
          method,
          url: safeHistoryUrl(parsed.toString()),
          status: result.status,
          durationMs: result.durationMs,
          at: Date.now()
        },
        ...history
      ].slice(0, 30)
      setHistory(next)
      try {
        localStorage.setItem(historyKey, JSON.stringify(next))
      } catch {
        setNotice('Request finished, but history could not be saved.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed.')
    } finally {
      activeRequestRef.current = null
      setActiveId(null)
    }
  }

  const saveRequest = (): void => {
    setError('')
    if (!url.trim()) {
      setError('Enter a URL before saving.')
      return
    }
    const name = (() => {
      try {
        return new URL(url.trim()).hostname
      } catch {
        return 'Untitled request'
      }
    })()
    const safeHeaders = headers
      .split('\n')
      .filter((line) => !privateHeader.test(line.trim()))
      .join('\n')
    const next = [
      { id: crypto.randomUUID(), name, method, url: url.trim(), headers: safeHeaders, body },
      ...saved
    ].slice(0, 40)
    try {
      localStorage.setItem(savedKey, JSON.stringify(next))
      setSaved(next)
      setNotice('Request saved locally. Authorization headers were omitted.')
    } catch {
      setError('Could not save this request on this device.')
    }
  }

  const removeSaved = (id: string): void => {
    const next = saved.filter((item) => item.id !== id)
    try {
      localStorage.setItem(savedKey, JSON.stringify(next))
      setSaved(next)
      setNotice('Saved request removed.')
    } catch {
      setError('Could not update saved requests.')
    }
  }

  const clearHistory = (): void => {
    try {
      localStorage.removeItem(historyKey)
      setHistory([])
      setNotice('Request history cleared.')
    } catch {
      setError('Could not clear request history.')
    }
  }

  const loadSaved = (item: SavedRequest): void => {
    setMethod(item.method)
    setUrl(item.url)
    setHeaders(item.headers)
    setBody(item.body)
    setResponse(null)
    setError('')
    setNotice(`Loaded ${item.name}.`)
  }

  const contentType = response?.headers['content-type'] || ''
  let responseText = ''
  if (responseTab === 'headers') {
    responseText = Object.entries(response?.headers || {})
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n')
  } else if (responseTab === 'axios') {
    responseText = curlToAxios(getParsedCurlCurrent())
  } else if (responseTab === 'curl') {
    let parsedHeaders: Record<string, string> = {}
    try {
      parsedHeaders = parseHeaders(headers)
    } catch {
      // ignore
    }
    responseText = axiosToCurl({ method, url: url.trim(), headers: parsedHeaders, body })
  } else if (responseTab === 'fetch') {
    responseText = curlToFetch(getParsedCurlCurrent())
  } else {
    responseText = prettyBody(response?.body || '', contentType)
  }

  return (
    <main className="studio-workspace api-workspace">
      <div className="studio-page-heading">
        <div>
          <span className="section-overline">DEVELOPER TOOLS · HTTP WORKBENCH</span>
          <h1>API Studio</h1>
          <p>Send requests to local or remote endpoints and inspect every response inside Nexus.</p>
        </div>
        <span className="studio-page-pill">
          <Braces size={15} /> HTTP client
        </span>
      </div>
      <div className="api-layout">
        <aside className="studio-sidepanel" aria-label="Saved API requests and history">
          <div className="studio-side-heading">
            <Save size={16} />
            <strong>Saved requests</strong>
            <span>{saved.length}</span>
          </div>
          {saved.length === 0 && (
            <p className="studio-muted">
              Save a request to reuse its URL, method, headers, and body.
            </p>
          )}
          {saved.map((item) => (
            <div className="api-saved-row" key={item.id}>
              <button type="button" onClick={() => loadSaved(item)}>
                <b>{item.method}</b>
                <span>{item.name}</span>
                <small>{item.url}</small>
              </button>
              <button
                type="button"
                aria-label={`Remove ${item.name}`}
                title="Remove saved request"
                onClick={() => removeSaved(item.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="studio-side-heading">
            <History size={16} />
            <strong>Recent runs</strong>
            <span>{history.length}</span>
            {history.length > 0 && (
              <button type="button" className="api-clear-history" onClick={clearHistory}>
                Clear
              </button>
            )}
          </div>
          {history.length === 0 && (
            <p className="studio-muted">
              Your last 30 requests will appear here. Query strings, headers, and bodies are not
              kept.
            </p>
          )}
          {history.map((item) => (
            <button
              className="api-history-row"
              type="button"
              key={item.id}
              onClick={() => {
                setMethod(item.method)
                setUrl(item.url)
                setNotice('Loaded endpoint from history. Query parameters were not saved.')
              }}
            >
              <b>{item.method}</b>
              <span>{item.url}</span>
              <small style={{ color: getStatusColor(item.status), fontWeight: 600 }}>
                {item.status}
              </small>
            </button>
          ))}
        </aside>
        <div className="api-main">
          <section className="studio-card" aria-labelledby="api-request-heading">
            <div className="studio-card-heading">
              <div>
                <span className="studio-step">01</span>
                <h2 id="api-request-heading">Request</h2>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="studio-secondary"
                  onClick={() => setShowImportModal(true)}
                  style={{
                    backgroundColor: 'rgba(99, 102, 241, 0.15)',
                    borderColor: 'rgba(99, 102, 241, 0.35)',
                    color: '#a5b4fc'
                  }}
                  title="Import a cURL command or Axios request"
                >
                  <FileCode size={15} /> Import cURL / Axios
                </button>
                <button
                  type="button"
                  className="studio-secondary"
                  onClick={() => void copyAsAxios()}
                  title="Copy request as modern Axios TypeScript code"
                >
                  <Code2 size={15} /> Copy Axios
                </button>
                <button
                  type="button"
                  className="studio-secondary"
                  onClick={() => void copyAsCurl()}
                  title="Copy request as formatted cURL command"
                >
                  <Copy size={15} /> Copy cURL
                </button>
                <button type="button" className="studio-secondary" onClick={saveRequest}>
                  <Save size={15} /> Save
                </button>
              </div>
            </div>
            <div className="api-request-line">
              <label className="sr-only" htmlFor="api-method">
                Method
              </label>
              <select
                id="api-method"
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <label className="sr-only" htmlFor="api-url">
                Request URL
              </label>
              <input
                id="api-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="http://localhost:3000/api/projects"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void send()
                }}
                spellCheck={false}
              />
              <button
                type="button"
                className="studio-primary"
                onClick={() => void send()}
                disabled={Boolean(activeId)}
              >
                {activeId ? <LoaderCircle className="is-spinning" size={16} /> : <Send size={16} />}
                {activeId ? 'Sending' : 'Send'}
              </button>
            </div>
            <div className="api-form-grid">
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px'
                  }}
                >
                  <label htmlFor="api-headers" style={{ margin: 0 }}>
                    Headers <small>One per line: Name: Value</small>
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '4px',
                        color: '#8baeff',
                        cursor: 'pointer'
                      }}
                      onClick={() => {
                        setHeaders((prev) => {
                          const h = prev.trim()
                          const add = 'Content-Type: application/json\nAccept: application/json'
                          return h ? `${h}\n${add}` : add
                        })
                      }}
                    >
                      + JSON
                    </button>
                    <button
                      type="button"
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '4px',
                        color: '#ffd54f',
                        cursor: 'pointer'
                      }}
                      onClick={() => {
                        setHeaders((prev) => {
                          const h = prev.trim()
                          const add = 'Authorization: Bearer <TOKEN>'
                          return h ? `${h}\n${add}` : add
                        })
                      }}
                    >
                      + Bearer
                    </button>
                  </div>
                </div>
                <textarea
                  id="api-headers"
                  value={headers}
                  onChange={(event) => setHeaders(event.target.value)}
                  placeholder={'Accept: application/json\nContent-Type: application/json'}
                  spellCheck={false}
                />
              </div>
              <div>
                <label htmlFor="api-body">
                  Body <small>Raw text or JSON</small>
                </label>
                <textarea
                  id="api-body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder={'{\n  "name": "My project"\n}'}
                  spellCheck={false}
                  disabled={method === 'GET' || method === 'HEAD'}
                />
              </div>
            </div>
            <div className="api-request-footer">
              <span>30-second timeout · 2 MB request · 5 MB response</span>
              {activeId && (
                <button type="button" onClick={() => window.api.cancelApiRequest(activeId)}>
                  <X size={14} /> Cancel request
                </button>
              )}
            </div>
          </section>
          {(error || notice) && (
            <div
              className={`studio-feedback ${error ? 'is-error' : 'is-success'}`}
              role={error ? 'alert' : 'status'}
            >
              {error || notice}
            </div>
          )}
          <section className="studio-card api-response-card" aria-labelledby="api-response-heading">
            <div className="studio-card-heading">
              <div>
                <span className="studio-step">02</span>
                <h2 id="api-response-heading">Response</h2>
              </div>
              {response && (
                <div className="api-response-meta">
                  <span style={{ color: getStatusColor(response.status), fontWeight: 600 }}>
                    {response.status} {response.statusText}
                  </span>
                  <span>
                    <Clock3 size={13} /> {response.durationMs} ms
                  </span>
                  <span>{(response.sizeBytes / 1024).toFixed(1)} KB</span>
                </div>
              )}
            </div>
            {response ? (
              <>
                {[301, 302, 303, 307, 308].includes(response.status) &&
                  response.headers.location && (
                    <div className="studio-feedback" role="status">
                      Redirect not followed. Review the Location header before sending a new
                      request.
                    </div>
                  )}
                <div className="api-response-tabs" style={{ flexWrap: 'wrap', gap: '4px' }}>
                  <button
                    type="button"
                    aria-pressed={responseTab === 'body'}
                    className={responseTab === 'body' ? 'is-active' : ''}
                    onClick={() => setResponseTab('body')}
                  >
                    Body
                  </button>
                  <button
                    type="button"
                    aria-pressed={responseTab === 'headers'}
                    className={responseTab === 'headers' ? 'is-active' : ''}
                    onClick={() => setResponseTab('headers')}
                  >
                    Headers ({Object.keys(response.headers).length})
                  </button>
                  <button
                    type="button"
                    aria-pressed={responseTab === 'axios'}
                    className={responseTab === 'axios' ? 'is-active' : ''}
                    onClick={() => setResponseTab('axios')}
                    style={{ color: '#818cf8' }}
                  >
                    <Code2 size={12} style={{ display: 'inline', marginRight: '3px' }} /> Axios Code
                  </button>
                  <button
                    type="button"
                    aria-pressed={responseTab === 'curl'}
                    className={responseTab === 'curl' ? 'is-active' : ''}
                    onClick={() => setResponseTab('curl')}
                    style={{ color: '#38bdf8' }}
                  >
                    <Terminal size={12} style={{ display: 'inline', marginRight: '3px' }} /> cURL
                  </button>
                  <button
                    type="button"
                    aria-pressed={responseTab === 'fetch'}
                    className={responseTab === 'fetch' ? 'is-active' : ''}
                    onClick={() => setResponseTab('fetch')}
                    style={{ color: '#4ade80' }}
                  >
                    Fetch
                  </button>
                  <button
                    type="button"
                    className="api-copy"
                    onClick={() =>
                      void window.api
                        .writeClipboardText(responseText)
                        .then(() => setNotice(`${responseTab.toUpperCase()} copied to clipboard.`))
                        .catch(() => setError('Could not copy response.'))
                    }
                  >
                    <Copy size={14} /> Copy
                  </button>
                </div>
                <pre className="api-response-body" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                  {responseText || '(empty response)'}
                </pre>
                {response.truncated && (
                  <p className="api-truncated">Response preview stopped at 5 MB.</p>
                )}
                <small className="api-response-url">
                  <ArrowUpRight size={12} /> {response.url}
                </small>
              </>
            ) : (
              <div className="api-empty">
                <Braces size={28} />
                <h3>Ready when you are</h3>
                <p>
                  Enter an endpoint above or import a cURL command. Status, timing, headers, and code
                  will appear here.
                </p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setShowImportModal(true)}
                    style={{
                      backgroundColor: 'rgba(99, 102, 241, 0.2)',
                      border: '1px solid rgba(99, 102, 241, 0.4)',
                      color: '#a5b4fc',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <FileCode size={14} /> Paste cURL or Axios
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUrl('http://127.0.0.1:3000/')
                      setMethod('GET')
                    }}
                  >
                    <Plus size={14} /> Use localhost:3000
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Import cURL / Axios Modal Dialog */}
      {showImportModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-curl-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowImportModal(false)
          }}
        >
          <div
            style={{
              backgroundColor: '#161922',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '680px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCode size={20} color="#818cf8" />
                <h3 id="import-curl-title" style={{ margin: 0, fontSize: '16px', color: '#fff' }}>
                  Import cURL or Axios Request
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer'
                }}
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
              Paste your raw multiline cURL command (with headers, -b cookies, query parameters, or body).
              Nexus will parse and convert it into a structured request and Axios code.
            </p>
            <textarea
              value={importCurlText}
              onChange={(e) => setImportCurlText(e.target.value)}
              placeholder={`curl 'https://api.example.com/data' \\\n  -H 'accept: */*' \\\n  -b 'session=abc; token=xyz'`}
              rows={8}
              spellCheck={false}
              style={{
                width: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.45)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '12px',
                color: '#f8fafc',
                fontSize: '12.5px',
                fontFamily: 'ui-monospace, monospace',
                resize: 'vertical',
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setImportCurlText(
                    `curl 'https://www.easemytrip.us/flight-search/ngsw.json?ngsw-cache-bust=0.7856671781126772' \\\n  -H 'accept: */*' \\\n  -H 'accept-language: en-GB,en;q=0.7' \\\n  -b 'etmsid=2026917144013212-779pbq-ekdr-bi4ssqizk-lv7goguqvo; etmuid=2026917144013214-pkcl5r-pjws-nlnhmwtw-vrp09g9zj6; G_ENABLED_IDPS=google; emt_trip_type=O; TOKEN=DCZH52dYi/kheZEKElW0pvFqifVXeOo8TsQNvMFuML8EQNjlGWBuOGDPBf+fWaeq' \\\n  -H 'priority: u=1, i' \\\n  -H 'referer: https://www.easemytrip.us/flight-search/ngsw-worker.js' \\\n  -H 'sec-fetch-dest: empty' \\\n  -H 'sec-fetch-mode: cors' \\\n  -H 'sec-fetch-site: same-origin' \\\n  -H 'sec-gpc: 1' \\\n  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'`
                  )
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#60a5fa',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Insert EaseMyTrip Sample
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    color: '#e2e8f0',
                    fontSize: '12.5px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleImportCurl(false)}
                  style={{
                    backgroundColor: 'rgba(99, 102, 241, 0.25)',
                    border: '1px solid rgba(99, 102, 241, 0.5)',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    color: '#c7d2fe',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Parse & Load
                </button>
                <button
                  type="button"
                  onClick={() => handleImportCurl(true)}
                  style={{
                    backgroundColor: '#4f46e5',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    color: '#fff',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Play size={14} /> Parse & Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
