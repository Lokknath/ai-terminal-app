/* eslint-disable react/no-unknown-property */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect, FormEvent } from 'react'
import { useApp } from '../store/AppContext'
import { CHROME_USER_AGENT } from '../types'
import { describeWebLoadError } from '../utils/web-errors'
import {
  X,
  ExternalLink,
  Maximize2,
  Pin,
  Copy,
  Terminal,
  Star,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Search,
  SplitSquareVertical,
  SplitSquareHorizontal,
  ChevronDown,
  Clipboard,
  Globe2,
  Activity,
  Plus
} from 'lucide-react'

interface WebChatPaneProps {
  id?: string
  url: string
  title: string
  partition?: string
  onDuplicate?: () => void
  onNewTab?: () => void
  onFocus?: () => void
  onOpenTermBeside?: () => void
  onSplitRight?: (
    type: 'terminal' | 'webchat',
    targetUrl?: string,
    targetTitle?: string,
    targetPartition?: string,
    targetAccountId?: string,
    targetEnv?: Record<string, string>
  ) => void
  onSplitDown?: (
    type: 'terminal' | 'webchat',
    targetUrl?: string,
    targetTitle?: string,
    targetPartition?: string,
    targetAccountId?: string,
    targetEnv?: Record<string, string>
  ) => void
  onQuickResize?: (percent: number) => void
  onMaximize?: () => void
  onDock?: () => void
  onClose: () => void
  onUrlChange?: (newUrl: string) => void
}

export default function WebChatPane({
  id,
  url,
  title,
  partition = 'persist:webchat',
  onDuplicate,
  onNewTab,
  onFocus,
  onOpenTermBeside,
  onSplitRight,
  onSplitDown,
  onQuickResize,
  onMaximize,
  onDock,
  onClose,
  onUrlChange
}: WebChatPaneProps): JSX.Element {
  const { state, dispatch } = useApp()
  const [currentUrl, setCurrentUrl] = useState(url)
  const [addressInput, setAddressInput] = useState(url)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showSplitMenu, setShowSplitMenu] = useState<'right' | 'down' | null>(null)
  const [currentPartition, setCurrentPartition] = useState(partition)
  const [currentPaneTitle, setCurrentPaneTitle] = useState(title)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [pasteFeedback, setPasteFeedback] = useState<{ text: string; success: boolean } | null>(
    null
  )

  useEffect(() => {
    if (currentUrl && onUrlChange && currentUrl !== url) {
      onUrlChange(currentUrl)
    }
  }, [currentUrl, onUrlChange, url])
  const webviewRef = useRef<any>(null)
  const navigationAttemptRef = useRef(0)
  const splitMenuRef = useRef<HTMLDivElement>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)

  // Find all accounts of the same provider
  const matchingAccounts = (state.aiAccounts || []).filter((a) => {
    const prov =
      url.includes('claude') || title.toLowerCase().includes('claude')
        ? 'claude'
        : url.includes('chatgpt') || title.toLowerCase().includes('chatgpt')
          ? 'chatgpt'
          : url.includes('gemini') || title.toLowerCase().includes('gemini')
            ? 'gemini'
            : 'custom'
    return a.providerId === prov
  })

  const isBraveOrSearch =
    title.toLowerCase().includes('brave') ||
    url.includes('search.brave.com') ||
    url.includes('google.com')

  // Keep address bar in sync with webview navigation
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const detectGoogleAuthEmail = async (): Promise<void> => {
      if (!webview) return
      try {
        const detected = await webview.executeJavaScript(`
          (() => {
            try {
              const links = Array.from(document.querySelectorAll('a[aria-label*="@"], button[aria-label*="@"], div[aria-label*="@"]'));
              for (const el of links) {
                const label = el.getAttribute('aria-label') || '';
                const m = label.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/);
                if (m && !m[1].endsWith('google.com')) return m[1];
              }
              const idEls = Array.from(document.querySelectorAll('[data-email], [data-identifier], [title*="@"]'));
              for (const el of idEls) {
                const val = el.getAttribute('data-email') || el.getAttribute('data-identifier') || el.getAttribute('title') || '';
                const m = val.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/);
                if (m && !m[1].endsWith('google.com')) return m[1];
              }
              return null;
            } catch {
              return null;
            }
          })()
        `)
        if (detected && typeof detected === 'string') {
          const acc = state.aiAccounts.find(
            (a) => a.partition === currentPartition || (a.providerId === 'gemini' && !currentPartition)
          )
          if (acc && acc.googleEmail !== detected) {
            void window.api.saveGoogleSSOCredentials(acc.id, detected)
          }
        }
      } catch {
        /* ignore inspection error */
      }
    }

    const handleNavigate = (e: any): void => {
      if (e.url) {
        setCurrentUrl(e.url)
        setAddressInput(e.url)
        if (e.url.includes('google.com') || e.url.includes('gemini.google.com')) {
          void detectGoogleAuthEmail()
        }
      }
    }

    const handleStartLoading = (): void => {
      setLoadError(null)
      setIsLoading(true)
    }
    const handleStopLoading = (): void => {
      setIsLoading(false)
      void detectGoogleAuthEmail()
    }
    const handleLoadFailure = (event: {
      errorCode: number
      errorDescription: string
      isMainFrame: boolean
    }): void => {
      if (event.isMainFrame && event.errorCode !== -3) {
        setIsLoading(false)
        setLoadError(describeWebLoadError(event.errorDescription))
      }
    }

    const handleRenderProcessGone = (event: { details?: { reason?: string; exitCode?: number } }): void => {
      setIsLoading(false)
      const reason = event.details?.reason || 'crashed'
      setLoadError(`The web page process unexpectedly terminated (${reason}). Click Reload to restore the session.`)
    }

    const handleFocus = (): void => {
      if (id) dispatch({ type: 'SET_ACTIVE_SESSION', id })
    }

    webview.addEventListener('did-navigate', handleNavigate)
    webview.addEventListener('did-navigate-in-page', handleNavigate)
    webview.addEventListener('did-start-loading', handleStartLoading)
    webview.addEventListener('did-stop-loading', handleStopLoading)
    webview.addEventListener('did-fail-load', handleLoadFailure)
    webview.addEventListener('render-process-gone', handleRenderProcessGone)
    webview.addEventListener('focus', handleFocus)

    return () => {
      webview.removeEventListener('did-navigate', handleNavigate)
      webview.removeEventListener('did-navigate-in-page', handleNavigate)
      webview.removeEventListener('did-start-loading', handleStartLoading)
      webview.removeEventListener('did-stop-loading', handleStopLoading)
      webview.removeEventListener('did-fail-load', handleLoadFailure)
      webview.removeEventListener('render-process-gone', handleRenderProcessGone)
      webview.removeEventListener('focus', handleFocus)
    }
  }, [id, dispatch])

  // Close split and account dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (splitMenuRef.current && !splitMenuRef.current.contains(e.target as Node)) {
        setShowSplitMenu(null)
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setShowAccountMenu(false)
      }
    }
    if (showSplitMenu || showAccountMenu) {
      window.addEventListener('mousedown', handleClickOutside)
    }
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [showSplitMenu, showAccountMenu])

  const handleNavigateSubmit = (e: FormEvent): void => {
    e.preventDefault()
    let destination = addressInput.trim()
    if (!destination) return

    if (/^https?:\/\//i.test(destination)) {
      // Direct full URL
    } else if (/^[\w-]+(\.[\w-]+)+[/#?]?.*$/i.test(destination) && !destination.includes(' ')) {
      destination = `https://${destination}`
    } else {
      // Search query using Brave Search
      destination = `https://search.brave.com/search?q=${encodeURIComponent(destination)}`
    }

    try {
      const parsed = new URL(destination)
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error()
    } catch {
      setLoadError('Enter a valid website address or search term.')
      return
    }

    setLoadError(null)
    setCurrentUrl(destination)
    setAddressInput(destination)
    if (webviewRef.current) {
      try {
        const attempt = ++navigationAttemptRef.current
        void Promise.resolve(webviewRef.current.loadURL(destination))
          .then(() => {
            if (attempt === navigationAttemptRef.current) setLoadError(null)
          })
          .catch((error: Error) => {
            if (attempt === navigationAttemptRef.current) {
              setLoadError(describeWebLoadError(error))
            }
          })
      } catch {
        setLoadError('This page could not be loaded.')
      }
    }
  }

  const goBack = (): void => {
    try {
      if (webviewRef.current?.canGoBack()) webviewRef.current.goBack()
    } catch {
      /* ignore */
    }
  }

  const goForward = (): void => {
    try {
      if (webviewRef.current?.canGoForward()) webviewRef.current.goForward()
    } catch {
      /* ignore */
    }
  }

  const reload = (): void => {
    try {
      setLoadError(null)
      if (!webviewRef.current) return
      const attempt = ++navigationAttemptRef.current
      // Reload the requested URL, not Chromium's internal error page.
      void Promise.resolve(webviewRef.current.loadURL(currentUrl))
        .then(() => {
          if (attempt === navigationAttemptRef.current) setLoadError(null)
        })
        .catch((error: Error) => {
          if (attempt === navigationAttemptRef.current) {
            setLoadError(describeWebLoadError(error))
          }
        })
    } catch {
      setLoadError('Could not reload this page.')
    }
  }

  const openCurrentInBrowser = (): void => {
    void window.api
      .openExternalURL(currentUrl)
      .then((opened) => {
        if (!opened) setLoadError('Could not open this page in your default browser.')
      })
      .catch(() => setLoadError('Could not open this page in your default browser.'))
  }

  const openChatHome = (): void => {
    const destination = currentUrl.includes('claude.ai')
      ? 'https://claude.ai/new'
      : currentUrl.includes('chatgpt.com')
        ? 'https://chatgpt.com/'
        : url
    setCurrentUrl(destination)
    setAddressInput(destination)
    setLoadError(null)
    const attempt = ++navigationAttemptRef.current
    void Promise.resolve(webviewRef.current?.loadURL(destination)).catch((error: Error) => {
      if (attempt === navigationAttemptRef.current) setLoadError(describeWebLoadError(error))
    })
  }

  const inspectNetwork = (): void => {
    try {
      webviewRef.current?.openDevTools()
    } catch {
      setLoadError('Network inspector is available after this page finishes loading.')
    }
  }

  const handlePasteIntoWebview = async (): Promise<void> => {
    const webview = webviewRef.current
    if (!webview) return
    try {
      webview.focus()
      const text = await window.api.readClipboardText()
      if (!text || !text.trim()) {
        setPasteFeedback({ text: 'Empty', success: false })
        setTimeout(() => setPasteFeedback(null), 1500)
        return
      }
      webview.insertText(text)
      const count = text.trim().length
      setPasteFeedback({ text: `✓ Pasted (${count}c)`, success: true })
      setTimeout(() => setPasteFeedback(null), 1500)
    } catch {
      try {
        webview.focus()
        webview.paste()
        setPasteFeedback({ text: '✓ Pasted', success: true })
        setTimeout(() => setPasteFeedback(null), 1500)
      } catch {
        setPasteFeedback({ text: 'Error', success: false })
        setTimeout(() => setPasteFeedback(null), 1500)
      }
    }
  }

  const isActive = id ? state.activeSessionId === id : false

  return (
    <div
      onMouseDown={() => {
        if (id) dispatch({ type: 'SET_ACTIVE_SESSION', id })
      }}
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0f0f11',
        borderRadius: '10px',
        overflow: 'hidden',
        border: isActive ? '1.5px solid #8baeff' : '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: isActive ? '0 0 16px rgba(139, 174, 255, 0.28)' : 'none',
        transition: 'border 0.15s, box-shadow 0.15s'
      }}
    >
      {/* Top Main Pane Header */}
      <div
        className="drag-handle web-pane-header"
        style={{
          backgroundColor: 'rgba(255,255,255,0.03)',
          color: 'white',
          padding: '6px 10px',
          fontSize: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'grab',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          fontFamily: 'system-ui'
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isBraveOrSearch ? '#ff5722' : '#4caf50',
              boxShadow: isBraveOrSearch
                ? '0 0 8px rgba(255,87,34,0.6)'
                : '0 0 8px rgba(76,175,80,0.5)'
            }}
          />
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontWeight: 600,
              letterSpacing: '0.4px',
              fontSize: '12px'
            }}
          >
            <Globe2 size={14} /> {currentPaneTitle}
          </span>

          {/* Account Switcher Dropdown (when multiple accounts exist for this service) */}
          {matchingAccounts.length > 0 && (
            <div style={{ position: 'relative', flexShrink: 0 }} ref={accountMenuRef}>
              <button
                aria-label={`Switch between ${matchingAccounts.length} accounts`}
                onClick={(e) => {
                  e.stopPropagation()
                  setShowAccountMenu(!showAccountMenu)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  border: '1px solid rgba(117, 157, 255, 0.3)',
                  backgroundColor: 'rgba(117, 157, 255, 0.08)',
                  color: '#8baeff',
                  fontSize: '10px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer'
                }}
                title="Switch between different accounts of this AI service"
              >
                <span>Accounts {matchingAccounts.length}</span>
                <ChevronDown size={10} />
              </button>

              {showAccountMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    backgroundColor: '#18181f',
                    border: '1px solid rgba(117, 157, 255, 0.4)',
                    borderRadius: '8px',
                    padding: '6px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.85)',
                    zIndex: 9999,
                    minWidth: '250px'
                  }}
                >
                  <div
                    style={{
                      fontSize: '9px',
                      color: '#888',
                      padding: '4px 8px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    Select Account (Isolated Cookie Partition)
                  </div>
                  {matchingAccounts.map((acc) => {
                    const isActive = currentPartition === acc.partition
                    return (
                      <div
                        key={acc.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '6px',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          backgroundColor: isActive ? 'rgba(117,157,255,0.1)' : 'transparent'
                        }}
                      >
                        <button
                          onClick={() => {
                            setCurrentPartition(acc.partition)
                            setCurrentPaneTitle(acc.name)
                            setCurrentUrl(acc.url)
                            setShowAccountMenu(false)
                            setAddressInput(acc.url)
                            setLoadError(null)
                          }}
                          style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'transparent',
                            border: 'none',
                            color: isActive ? '#8baeff' : '#eee',
                            fontSize: '11px',
                            fontWeight: isActive ? 600 : 400,
                            cursor: 'pointer',
                            textAlign: 'left',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <span>{isActive ? '●' : '○'}</span>
                          <span>{acc.name}</span>
                        </button>
                        {onSplitRight && (
                          <button
                            onClick={() => {
                              onSplitRight('webchat', acc.url, acc.name, acc.partition, acc.id)
                              setShowAccountMenu(false)
                            }}
                            title="Open this account beside in split screen"
                            style={{
                              padding: '2px 5px',
                              fontSize: '9px',
                              borderRadius: '3px',
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: '#aaa',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            ⧉ Split Beside
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* A single native control keeps pane sizing usable in narrow split views. */}
          {onQuickResize && (
            <select
              className="pane-resize-select"
              aria-label="Resize web pane"
              value=""
              onChange={(event) => onQuickResize(Number(event.target.value))}
            >
              <option value="" disabled>
                Resize
              </option>
              <option value="33">33%</option>
              <option value="50">50%</option>
              <option value="67">67%</option>
              <option value="100">Full</option>
            </select>
          )}
        </div>

        <div
          style={{ display: 'flex', gap: '4px', alignItems: 'center', position: 'relative' }}
          ref={splitMenuRef}
        >
          {/* In-Pane Split Right Button */}
          {onSplitRight && (
            <button
              className="pane-split-button"
              onClick={() => setShowSplitMenu(showSplitMenu === 'right' ? null : 'right')}
              title="Split Right with another panel"
              style={{
                background:
                  showSplitMenu === 'right' ? 'rgba(117,157,255,0.2)' : 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: showSplitMenu === 'right' ? '#8baeff' : '#aaa',
                cursor: 'pointer',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <SplitSquareHorizontal size={12} /> Split ◧ <ChevronDown size={9} />
            </button>
          )}

          {/* In-Pane Split Down Button */}
          {onSplitDown && (
            <button
              className="pane-split-button"
              onClick={() => setShowSplitMenu(showSplitMenu === 'down' ? null : 'down')}
              title="Split Down with another panel"
              style={{
                background:
                  showSplitMenu === 'down' ? 'rgba(117,157,255,0.2)' : 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: showSplitMenu === 'down' ? '#8baeff' : '#aaa',
                cursor: 'pointer',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <SplitSquareVertical size={12} /> ⬒
            </button>
          )}

          {/* Split Dropdown Menu */}
          {showSplitMenu && (
            <div
              style={{
                position: 'absolute',
                top: '26px',
                right: '40px',
                backgroundColor: 'rgba(18, 18, 24, 0.98)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(117, 157, 255, 0.4)',
                boxShadow: '0 12px 30px rgba(0,0,0,0.8), 0 0 16px rgba(117,157,255,0.15)',
                borderRadius: '8px',
                padding: '6px',
                zIndex: 9999,
                width: '210px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
              }}
            >
              <div
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  color: '#8baeff',
                  textTransform: 'uppercase',
                  padding: '3px 6px'
                }}
              >
                Split {showSplitMenu === 'right' ? 'Right (50/50)' : 'Below (Stacked)'} with:
              </div>
              <button
                onClick={() => {
                  const fn = showSplitMenu === 'right' ? onSplitRight : onSplitDown
                  fn?.('terminal')
                  setShowSplitMenu(null)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 8px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '5px',
                  color: '#eee',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '11px'
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                }
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Terminal size={13} color="#8baeff" /> New Terminal (Shell)
              </button>

              {state.aiAccounts && state.aiAccounts.length > 0 ? (
                state.aiAccounts.map((acc) => {
                  const icon =
                    acc.providerId === 'claude'
                      ? '🧠'
                      : acc.providerId === 'chatgpt'
                        ? '🤖'
                        : acc.providerId === 'gemini'
                          ? '💎'
                          : '🦁'
                  return (
                    <button
                      key={acc.id}
                      onClick={() => {
                        const fn = showSplitMenu === 'right' ? onSplitRight : onSplitDown
                        fn?.('webchat', acc.url, acc.name, acc.partition, acc.id)
                        setShowSplitMenu(null)
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '5px',
                        color: '#eee',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '11px'
                      }}
                      onMouseOver={(e) =>
                        (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                      }
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <span style={{ fontSize: '13px' }}>{icon}</span>
                        <span>{acc.name}</span>
                      </div>
                    </button>
                  )
                })
              ) : (
                <>
                  <button
                    onClick={() => {
                      const fn = showSplitMenu === 'right' ? onSplitRight : onSplitDown
                      fn?.(
                        'webchat',
                        'https://search.brave.com',
                        'Brave Browser',
                        'persist:account-brave-default'
                      )
                      setShowSplitMenu(null)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '5px',
                      color: '#eee',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '11px'
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                    }
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Globe2 size={13} /> Browser
                  </button>
                  <button
                    onClick={() => {
                      const fn = showSplitMenu === 'right' ? onSplitRight : onSplitDown
                      fn?.(
                        'webchat',
                        'https://chatgpt.com',
                        'ChatGPT',
                        'persist:account-chatgpt-default'
                      )
                      setShowSplitMenu(null)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '5px',
                      color: '#eee',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '11px'
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                    }
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ fontSize: '13px' }}>🤖</span> ChatGPT Screen
                  </button>
                  <button
                    onClick={() => {
                      const fn = showSplitMenu === 'right' ? onSplitRight : onSplitDown
                      fn?.(
                        'webchat',
                        'https://claude.ai',
                        'Claude.ai',
                        'persist:account-claude-default'
                      )
                      setShowSplitMenu(null)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '5px',
                      color: '#eee',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '11px'
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                    }
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ fontSize: '13px' }}>🧠</span> Claude.ai Screen
                  </button>
                </>
              )}
            </div>
          )}

          {/* Duplicate / Clone Screen */}
          {onDuplicate && (
            <button
              onClick={onDuplicate}
              title="Clone Screen (+ New Web Screen)"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                display: 'flex',
                padding: '2px'
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#8baeff')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
            >
              <Copy size={13} />
            </button>
          )}

          {/* Open Terminal Beside (1 Screen) */}
          {onOpenTermBeside && (
            <button
              onClick={onOpenTermBeside}
              title="Open Terminal Beside (1-Screen Split)"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                display: 'flex',
                padding: '2px'
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#4caf50')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
            >
              <Terminal size={13} />
            </button>
          )}

          {/* Focus Master Mode */}
          {onFocus && (
            <button
              onClick={onFocus}
              title="Focus Master (+ Tiled Others)"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                display: 'flex',
                padding: '2px'
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#ffc107')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
            >
              <Star size={13} />
            </button>
          )}

          {/* Maximize to full view */}
          {onMaximize && (
            <button
              onClick={onMaximize}
              title="Expand to Full View"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                display: 'flex',
                padding: '2px'
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#8baeff')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
            >
              <Maximize2 size={13} />
            </button>
          )}

          {/* Dock to sidebar */}
          {onDock && (
            <button
              onClick={onDock}
              title="Dock to Sidebar"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                display: 'flex',
                padding: '2px'
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#ffc107')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
            >
              <Pin size={13} />
            </button>
          )}

          <button
            onClick={openCurrentInBrowser}
            title="Open in default browser"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              display: 'flex',
              padding: '2px'
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
          >
            <ExternalLink size={13} />
          </button>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ff5f56',
              cursor: 'pointer',
              display: 'flex',
              padding: '2px',
              opacity: 0.75,
              transition: 'opacity 0.15s'
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '0.75')}
            title="Close Web View"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Interactive Browser Navigation & URL Bar (Brave Browser Experience) */}
      <div className="webchat-homebar">
        <span>
          {currentUrl.includes('claude.ai') || currentUrl.includes('chatgpt.com')
            ? 'Signed-in web session'
            : 'Browser workspace'}
        </span>
        {(currentUrl.includes('claude.ai') || currentUrl.includes('chatgpt.com')) && (
          <button type="button" onClick={openChatHome}>
            New chat
          </button>
        )}
        {onNewTab && (
          <button type="button" onClick={onNewTab}>
            <Plus size={14} /> New browser tab
          </button>
        )}
        <button
          type="button"
          onClick={inspectNetwork}
          title="Open Developer Tools for this page; choose the Network tab to inspect requests"
        >
          <Activity size={14} /> Inspect network
        </button>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          backgroundColor: 'rgba(12, 12, 16, 0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.06)'
        }}
      >
        <button
          onClick={goBack}
          title="Back"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            padding: '3px',
            display: 'flex',
            borderRadius: '4px'
          }}
          onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
        >
          <ArrowLeft size={13} />
        </button>

        <button
          onClick={goForward}
          title="Forward"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            padding: '3px',
            display: 'flex',
            borderRadius: '4px'
          }}
          onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
        >
          <ArrowRight size={13} />
        </button>

        <button
          onClick={reload}
          title="Reload"
          style={{
            background: 'transparent',
            border: 'none',
            color: isLoading ? '#8baeff' : '#888',
            cursor: 'pointer',
            padding: '3px',
            display: 'flex',
            borderRadius: '4px'
          }}
          onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseOut={(e) => (e.currentTarget.style.color = isLoading ? '#8baeff' : '#888')}
        >
          <RotateCw size={13} />
        </button>

        <form
          onSubmit={handleNavigateSubmit}
          style={{ flex: 1, display: 'flex', alignItems: 'center' }}
        >
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              padding: '2px 8px',
              gap: '6px'
            }}
          >
            <Search size={11} color="#666" />
            <input
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="Search with Brave or enter website URL..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '11px',
                outline: 'none',
                fontFamily: 'monospace'
              }}
            />
          </div>
        </form>

        {/* Quick Paste into Webview Button */}
        <button
          onClick={handlePasteIntoWebview}
          title="Paste from Clipboard into focused web field (Cmd+V)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            padding: '2px 6px',
            borderRadius: '4px',
            border: pasteFeedback
              ? pasteFeedback.success
                ? '1px solid #4caf50'
                : '1px solid #f44336'
              : '1px solid rgba(117, 157, 255, 0.25)',
            backgroundColor: pasteFeedback
              ? pasteFeedback.success
                ? 'rgba(76, 175, 80, 0.18)'
                : 'rgba(244, 67, 54, 0.18)'
              : 'rgba(117, 157, 255, 0.08)',
            color: pasteFeedback ? (pasteFeedback.success ? '#4caf50' : '#f44336') : '#8baeff',
            fontSize: '10px',
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s'
          }}
          onMouseOver={(e) => {
            if (!pasteFeedback) {
              e.currentTarget.style.backgroundColor = 'rgba(117, 157, 255, 0.18)'
              e.currentTarget.style.borderColor = '#8baeff'
            }
          }}
          onMouseOut={(e) => {
            if (!pasteFeedback) {
              e.currentTarget.style.backgroundColor = 'rgba(117, 157, 255, 0.08)'
              e.currentTarget.style.borderColor = 'rgba(117, 157, 255, 0.25)'
            }
          }}
        >
          <Clipboard size={11} />
          <span>{pasteFeedback ? pasteFeedback.text : 'Paste'}</span>
        </button>

        <span
          style={{
            fontSize: '9px',
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: 'rgba(255, 87, 34, 0.15)',
            color: '#ff7043',
            fontWeight: 600,
            whiteSpace: 'nowrap'
          }}
          title="Embedded browser"
        >
          <Globe2 size={11} /> Web
        </span>
      </div>

      {loadError && (
        <div className="webview-error" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={reload}>
            Try again
          </button>
          <button type="button" onClick={openCurrentInBrowser}>
            Open in browser
          </button>
        </div>
      )}
      <webview
        key={currentPartition}
        ref={webviewRef}
        src={currentUrl}
        style={{ flex: 1, border: 'none' }}
        // @ts-ignore - Electron webview attribute allowpopups
        allowpopups="true"
        partition={currentPartition}
        useragent={CHROME_USER_AGENT}
      />
    </div>
  )
}
