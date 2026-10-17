/* eslint-disable react/no-unknown-property */
import { useEffect, useRef, useState } from 'react'
import { Activity, ExternalLink, Globe2, Plus, RotateCw, Settings2, Key } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { describeWebLoadError } from '../utils/web-errors'

type ChatWebview = HTMLElement & {
  loadURL: (url: string) => Promise<void>
  isLoading?: () => boolean
}

export default function ChatWorkspace(): JSX.Element {
  const { state, dispatch } = useApp()
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const webviewRef = useRef<ChatWebview>(null)
  const attemptRef = useRef(0)
  const currentAccount =
    state.aiAccounts.find((account) => account.id === selectedAccountId) || state.aiAccounts[0]

  useEffect(() => {
    const view = webviewRef.current
    if (!view) return
    const start = (): void => {
      setIsLoading(true)
      setLoadError(null)
    }
    let readinessCheck: ReturnType<typeof setInterval> | undefined
    const stop = (): void => {
      if (readinessCheck) clearInterval(readinessCheck)
      readinessCheck = undefined
      setIsLoading(false)
    }
    const fail = (event: Event): void => {
      const detail = event as Event & {
        errorCode?: number
        errorDescription?: string
        isMainFrame?: boolean
      }
      if (detail.isMainFrame && detail.errorCode !== -3) {
        stop()
        setLoadError(describeWebLoadError(detail.errorDescription))
      }
    }
    const settleIfReady = (): void => {
      // Electron exposes isLoading before the guest is attached, but calling it then throws.
      try {
        if (typeof view.isLoading === 'function' && !view.isLoading()) stop()
      } catch {
        // dom-ready or did-finish-load will settle the initial navigation.
      }
    }
    view.addEventListener('dom-ready', settleIfReady)
    view.addEventListener('did-start-loading', start)
    view.addEventListener('did-stop-loading', stop)
    view.addEventListener('did-finish-load', stop)
    view.addEventListener('did-fail-load', fail)
    // Initial guest events can finish before React attaches listeners. Poll only
    // until the guest is attached and its first navigation has settled.
    readinessCheck = setInterval(settleIfReady, 250)
    settleIfReady()
    return () => {
      if (readinessCheck) clearInterval(readinessCheck)
      view.removeEventListener('dom-ready', settleIfReady)
      view.removeEventListener('did-start-loading', start)
      view.removeEventListener('did-stop-loading', stop)
      view.removeEventListener('did-finish-load', stop)
      view.removeEventListener('did-fail-load', fail)
    }
  }, [currentAccount?.id])

  const retry = (): void => {
    if (!currentAccount || !webviewRef.current) return
    setLoadError(null)
    setIsLoading(true)
    const attempt = ++attemptRef.current
    const handleError = (error: unknown): void => {
      if (attempt === attemptRef.current) {
        setIsLoading(false)
        setLoadError(describeWebLoadError(error))
      }
    }
    try {
      void Promise.resolve(webviewRef.current.loadURL(currentAccount.url)).catch(handleError)
    } catch (error) {
      handleError(error)
    }
  }

  const openExternal = (): void => {
    if (!currentAccount) return
    void window.api
      .openExternalURL(currentAccount.url)
      .then((opened) => {
        setLoadError(opened ? null : 'Could not open this account in your default browser.')
      })
      .catch(() => setLoadError('Could not open this account in your default browser.'))
  }

  const handleGoogleSignIn = async (): Promise<void> => {
    if (!currentAccount) return
    setIsLoading(true)
    try {
      const res = await window.api.openGoogleLoginWindow(
        currentAccount.partition,
        currentAccount.providerId
      )
      if (res.success) {
        retry()
      } else {
        setLoadError('Google sign-in was not completed.')
      }
    } catch {
      setLoadError('Could not launch Google sign-in window.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="chat-workspace">
      <div className="chat-workspace-toolbar">
        <div className="chat-workspace-identity">
          <Globe2 size={17} />
          <strong>Web chat</strong>
        </div>
        {currentAccount && (
          <>
            <select
              className="chat-account-select"
              aria-label="AI chat account"
              value={currentAccount.id}
              onChange={(event) => {
                attemptRef.current++
                setIsLoading(true)
                setLoadError(null)
                setSelectedAccountId(event.target.value)
              }}
            >
              {state.aiAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <span
              className="chat-session-indicator"
              title={
                currentAccount.providerId === 'gemini'
                  ? 'Google account with persistent isolated webview session'
                  : 'This account uses a separate persistent browser session'
              }
            >
              {currentAccount.providerId === 'gemini' ? 'Google Session' : 'Isolated session'}
            </span>
          </>
        )}
        <div className="chat-workspace-actions">
          {currentAccount?.providerId === 'gemini' && (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              title="Sign in with Google inside Nexus"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: 'rgba(66, 133, 244, 0.15)',
                border: '1px solid rgba(66, 133, 244, 0.4)',
                color: '#8ab4f8'
              }}
            >
              <Key size={14} />
              <span>Google Sign-In</span>
            </button>
          )}
          {currentAccount && (
            <button
              type="button"
              onClick={() => {
                try {
                  ;(
                    webviewRef.current as (ChatWebview & { openDevTools?: () => void }) | null
                  )?.openDevTools?.()
                } catch {
                  setLoadError('Network inspector is available after the page loads.')
                }
              }}
              title="Open Developer Tools and choose Network to inspect calls"
            >
              <Activity size={14} />
              <span>Network</span>
            </button>
          )}
          {currentAccount && (
            <button type="button" onClick={openExternal} title="Open in default browser">
              <ExternalLink size={14} />
              <span>Open externally</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_SHOW_SETTINGS', show: true })}
            title="Manage accounts"
          >
            <Settings2 size={14} />
            <span>Accounts</span>
          </button>
        </div>
      </div>

      {currentAccount ? (
        <div className="chat-webview-container">
          {isLoading && (
            <div className="chat-loading" role="status">
              Opening {currentAccount.name}…
            </div>
          )}
          {loadError && (
            <div className="chat-error" role="alert">
              <span>{loadError}</span>
              <button type="button" onClick={retry}>
                <RotateCw size={13} /> Retry
              </button>
              {currentAccount.providerId === 'gemini' && (
                <button type="button" onClick={handleGoogleSignIn}>
                  Sign in with Google
                </button>
              )}
              <button type="button" onClick={openExternal}>
                Open in browser
              </button>
            </div>
          )}
          <webview
            key={currentAccount.id}
            ref={webviewRef}
            src={currentAccount.url}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allowpopups
            partition={currentAccount.partition}
          />
        </div>
      ) : (
        <div className="chat-empty-state">
          <Globe2 size={28} />
          <h2>No web accounts yet</h2>
          <p>Add an account to open its isolated browser session here.</p>
          <button type="button" onClick={() => dispatch({ type: 'SET_SHOW_SETTINGS', show: true })}>
            <Plus size={15} /> Add account
          </button>
        </div>
      )}
    </div>
  )
}
