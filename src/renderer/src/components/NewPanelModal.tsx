import { useState, useEffect, useRef } from 'react'
import {
  X,
  Search,
  TerminalSquare,
  Globe,
  FolderOpen,
  Sparkles,
  Columns2,
  Columns3,
  LayoutGrid,
  Settings,
  Terminal,
  ShieldCheck,
  NotebookPen,
  Send
} from 'lucide-react'
import { LayoutPresetType } from './HeaderBar'
import { useApp } from '../store/AppContext'
import { getAccountEnv, getProviderCliCommand } from '../types'
import { useDialogFocus } from '../hooks/useDialogFocus'

interface NewPanelModalProps {
  onClose: () => void
  onNewTerminal: (
    cwd?: string,
    name?: string,
    command?: string,
    providerId?: string,
    accountId?: string,
    customEnv?: Record<string, string>
  ) => void
  onOpenFolderPicker: (title: string, onSelect: (path: string) => void) => void
  onNewWebChat: (url: string, title: string, partition?: string) => void
  onLaunchCLI: (
    command: string,
    name: string,
    accountId?: string,
    customEnv?: Record<string, string>
  ) => void
  onApplyLayoutPreset: (layout: LayoutPresetType) => void
}

export default function NewPanelModal({
  onClose,
  onNewTerminal,
  onOpenFolderPicker,
  onNewWebChat,
  onApplyLayoutPreset
}: NewPanelModalProps): JSX.Element {
  const { state, dispatch } = useApp()
  const [search, setSearch] = useState('')
  const [customWebUrl, setCustomWebUrl] = useState('')
  const [launchError, setLaunchError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus(dialogRef, onClose)

  const handleOpenCustomUrl = (): void => {
    let finalUrl = customWebUrl.trim()
    if (!finalUrl) return
    if (!/^https?:\/\//i.test(finalUrl)) {
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = 'https://' + finalUrl
      } else {
        finalUrl = `https://search.brave.com/search?q=${encodeURIComponent(finalUrl)}`
      }
    }
    setLaunchError(null)
    let title = 'Browser'
    try {
      const u = new URL(finalUrl)
      title = u.hostname.replace('www.', '')
      onNewWebChat(finalUrl, title, 'persist:research')
      onClose()
    } catch {
      setLaunchError('Invalid website address. Please enter a valid URL or search term.')
    }
  }

  useEffect(() => {
    inputRef.current?.focus()
    return undefined
  }, [onClose])

  const filterMatch = (text: string): boolean =>
    !search || text.toLowerCase().includes(search.toLowerCase())

  const openSettings = (): void => {
    onClose()
    dispatch({ type: 'SET_SHOW_SETTINGS', show: true })
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 5, 8, 0.78)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '8vh',
        zIndex: 100000
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="new-panel-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Create a new pane"
        style={{
          width: '700px',
          maxWidth: '92vw',
          maxHeight: '84vh',
          backgroundColor: 'rgba(18, 18, 24, 0.98)',
          borderRadius: '16px',
          border: '1px solid rgba(117, 157, 255, 0.35)',
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.9), 0 0 35px rgba(117, 157, 255, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header with Search Input & Settings shortcut */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <Search size={18} color="#8baeff" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search terminals, web chats, or layout splits..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 500,
              outline: 'none',
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Clear
            </button>
          )}

          <button
            onClick={openSettings}
            title="Manage web accounts and CLI profiles in Settings"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '6px',
              background: 'rgba(117, 157, 255, 0.08)',
              border: '1px solid rgba(117, 157, 255, 0.3)',
              color: '#8baeff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Settings size={12} />
            <span>Settings</span>
          </button>

          <button
            onClick={onClose}
            aria-label="Close new pane dialog"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              color: '#aaa',
              cursor: 'pointer',
              borderRadius: '6px',
              padding: '4px',
              display: 'flex'
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#aaa')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Content: Unified 3 Sections */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {launchError && (
            <div className="settings-feedback is-error" role="alert">
              {launchError}
            </div>
          )}
          <div className="new-panel-quick-links" aria-label="Create workspace tool">
            <button
              type="button"
              onClick={() => {
                onNewWebChat('https://search.brave.com', 'Browser', 'persist:research')
                onClose()
              }}
            >
              <Globe size={18} />
              <span>
                <strong>Browser tab</strong>
                <small>Explore the web in Nexus</small>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'SET_MODE', mode: 'notes' })
                onClose()
              }}
            >
              <NotebookPen size={18} />
              <span>
                <strong>Notes</strong>
                <small>Capture ideas and context</small>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'SET_MODE', mode: 'api' })
                onClose()
              }}
            >
              <Send size={18} />
              <span>
                <strong>API Studio</strong>
                <small>Send and inspect requests</small>
              </span>
            </button>
          </div>
          {/* Section 1: Terminals & Project Shells */}
          {(filterMatch('terminal') ||
            filterMatch('shell') ||
            filterMatch('folder') ||
            filterMatch('directory') ||
            filterMatch('account')) && (
            <div style={{ marginBottom: '22px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px'
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#8baeff',
                    textTransform: 'uppercase',
                    letterSpacing: '0.8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <TerminalSquare size={13} /> Terminals & Workspaces
                </div>
                <span style={{ fontSize: '11px', color: '#888' }}>
                  Live shell · Work stays on your disk
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
                  gap: '10px'
                }}
              >
                {/* Standard Home Terminal */}
                <button
                  onClick={() => {
                    onNewTerminal('~')
                    onClose()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '10px',
                    color: '#eee',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(117, 157, 255, 0.08)'
                    e.currentTarget.style.borderColor = 'rgba(117, 157, 255, 0.35)'
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
                  }}
                >
                  <div
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(117, 157, 255, 0.1)',
                      display: 'flex'
                    }}
                  >
                    <TerminalSquare size={16} color="#8baeff" />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                      New Terminal (Home ~)
                    </div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                      Default shell over home folder
                    </div>
                  </div>
                </button>

                {/* Open Folder Picker */}
                <button
                  onClick={() => {
                    onClose()
                    onOpenFolderPicker('Select Directory for Terminal', (folder) =>
                      onNewTerminal(folder)
                    )
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '10px',
                    color: '#eee',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(117, 157, 255, 0.08)'
                    e.currentTarget.style.borderColor = 'rgba(117, 157, 255, 0.35)'
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
                  }}
                >
                  <div
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      display: 'flex'
                    }}
                  >
                    <FolderOpen size={16} color="#ffc107" />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                      Choose Project Folder...
                    </div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                      Open shell in any repo or local directory
                    </div>
                  </div>
                </button>

                {/* Terminals pre-configured with Settings accounts */}
                {state.aiAccounts.map((account) => {
                  const icon =
                    account.providerId === 'claude'
                      ? '🧠'
                      : account.providerId === 'chatgpt'
                        ? '🤖'
                        : account.providerId === 'gemini'
                          ? '💎'
                          : '🦁'
                  const cmd = getProviderCliCommand(account.providerId, account)
                  const accountEnv = getAccountEnv(account)
                  const profileLabel =
                    account.cliConfigDir ||
                    accountEnv.CLAUDE_CONFIG_DIR ||
                    accountEnv.CODEX_HOME ||
                    accountEnv.GEMINI_DIR ||
                    (account.providerId === 'claude'
                      ? '~/.claude'
                      : account.providerId === 'chatgpt'
                        ? '~/.codex'
                        : account.providerId === 'gemini'
                          ? '~/.gemini'
                          : 'Standard shell')
                  return (
                    <div
                      key={`term-acc-${account.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        padding: '10px 14px',
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '10px',
                        color: '#eee',
                        transition: 'all 0.15s'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(117, 157, 255, 0.04)'
                        e.currentTarget.style.borderColor = 'rgba(117, 157, 255, 0.25)'
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)'
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
                      }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Open shell with ${account.name} profile`}
                        onClick={() => {
                          onNewTerminal(
                            '~',
                            `${account.name} (Shell)`,
                            undefined,
                            account.providerId,
                            account.id,
                            accountEnv
                          )
                          onClose()
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            event.currentTarget.click()
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          flex: 1,
                          cursor: 'pointer',
                          overflow: 'hidden'
                        }}
                        title={`Open shell with ${account.name} profile`}
                      >
                        <div
                          style={{
                            padding: '8px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(117, 157, 255, 0.12)',
                            display: 'flex',
                            fontSize: '15px'
                          }}
                        >
                          {icon}
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <span>{account.name}</span>
                            {account.isDefault && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  color: '#ffc107',
                                  backgroundColor: 'rgba(255, 193, 7, 0.15)',
                                  padding: '1px 4px',
                                  borderRadius: '3px'
                                }}
                              >
                                ★ Default
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: '12px',
                              color: '#888',
                              marginTop: '2px',
                              textOverflow: 'ellipsis',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            Profile: {profileLabel}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        {cmd && (
                          <button
                            onClick={() => {
                              onNewTerminal(
                                '~',
                                `${account.name} (${cmd})`,
                                cmd,
                                account.providerId,
                                account.id,
                                accountEnv
                              )
                              onClose()
                            }}
                            title={`Launch ${cmd} agent with ${account.name} profile`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 9px',
                              backgroundColor: 'rgba(117, 157, 255, 0.12)',
                              border: '1px solid rgba(117, 157, 255, 0.35)',
                              borderRadius: '6px',
                              color: '#8baeff',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.12s'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(117, 157, 255, 0.22)'
                              e.currentTarget.style.borderColor = '#8baeff'
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(117, 157, 255, 0.12)'
                              e.currentTarget.style.borderColor = 'rgba(117, 157, 255, 0.35)'
                            }}
                          >
                            <Sparkles size={11} /> {cmd} ▶
                          </button>
                        )}

                        <button
                          onClick={() => {
                            onNewTerminal(
                              '~',
                              `${account.name} (Shell)`,
                              undefined,
                              account.providerId,
                              account.id,
                              accountEnv
                            )
                            onClose()
                          }}
                          title={`Open clean interactive shell in ${account.name} profile`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '5px 9px',
                            backgroundColor: 'rgba(76, 175, 80, 0.12)',
                            border: '1px solid rgba(76, 175, 80, 0.3)',
                            borderRadius: '6px',
                            color: '#81c784',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.12s'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(76, 175, 80, 0.22)'
                            e.currentTarget.style.borderColor = '#81c784'
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(76, 175, 80, 0.12)'
                            e.currentTarget.style.borderColor = 'rgba(76, 175, 80, 0.3)'
                          }}
                        >
                          <Terminal size={11} /> Shell
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Section 2: Web Chat & Live Web Browsers (Configured in Settings) */}
          {(filterMatch('account') ||
            filterMatch('login') ||
            filterMatch('brave') ||
            filterMatch('browser') ||
            filterMatch('web') ||
            filterMatch('chatgpt') ||
            filterMatch('claude') ||
            filterMatch('agy') ||
            filterMatch('antigravity') ||
            filterMatch('gemini')) && (
            <div style={{ marginBottom: '22px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px'
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#ff7043',
                    textTransform: 'uppercase',
                    letterSpacing: '0.8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Globe size={13} /> AI Web Chat & Isolated Browsers
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    color: '#4caf50'
                  }}
                >
                  <ShieldCheck size={12} />
                  <span>Separate profiles where supported</span>
                </div>
              </div>

              {/* Direct URL input bar for any website or search */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="Enter any URL or search (e.g. google.com, github.com, claude.ai)..."
                  value={customWebUrl}
                  onChange={(e) => setCustomWebUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleOpenCustomUrl()
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '13px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    color: '#fff',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={handleOpenCustomUrl}
                  disabled={!customWebUrl.trim()}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    backgroundColor: '#3b82f6',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    cursor: customWebUrl.trim() ? 'pointer' : 'not-allowed',
                    opacity: customWebUrl.trim() ? 1 : 0.5
                  }}
                >
                  Open
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
                  gap: '10px'
                }}
              >
                {state.aiAccounts.map((account) => {
                  return (
                    <button
                      type="button"
                      className="new-panel-account-card"
                      key={`web-${account.id}`}
                      onClick={() => {
                        onNewWebChat(account.url, account.name, account.partition)
                        onClose()
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        backgroundColor:
                          account.url.includes('brave') ||
                          account.name.toLowerCase().includes('brave')
                            ? 'rgba(255, 87, 34, 0.06)'
                            : 'rgba(255, 255, 255, 0.03)',
                        border:
                          account.url.includes('brave') ||
                          account.name.toLowerCase().includes('brave')
                            ? '1px solid rgba(255, 87, 34, 0.3)'
                            : '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '10px',
                        color: '#eee',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = account.url.includes('brave')
                          ? 'rgba(255, 87, 34, 0.15)'
                          : 'rgba(255, 255, 255, 0.08)'
                        e.currentTarget.style.borderColor = account.url.includes('brave')
                          ? '#ff7043'
                          : 'rgba(117, 157, 255, 0.35)'
                        e.currentTarget.style.transform = 'translateY(-1px)'
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = account.url.includes('brave')
                          ? 'rgba(255, 87, 34, 0.06)'
                          : 'rgba(255, 255, 255, 0.03)'
                        e.currentTarget.style.borderColor = account.url.includes('brave')
                          ? 'rgba(255, 87, 34, 0.3)'
                          : 'rgba(255, 255, 255, 0.08)'
                        e.currentTarget.style.transform = 'none'
                      }}
                    >
                      <div
                        className="new-panel-provider-icon"
                        data-provider={account.providerId}
                        aria-hidden="true"
                      >
                        {account.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}
                        >
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {account.name}
                          </span>
                          {account.isDefault && (
                            <span
                              style={{
                                fontSize: '10px',
                                color: '#ffc107',
                                backgroundColor: 'rgba(255, 193, 7, 0.15)',
                                padding: '1px 4px',
                                borderRadius: '3px'
                              }}
                            >
                              ★ Default
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#888',
                            marginTop: '2px',
                            fontFamily: 'monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {account.url}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Section 3: Tile + WebChat Split Combinations */}
          {(filterMatch('tile') ||
            filterMatch('webchat') ||
            filterMatch('split') ||
            filterMatch('side by side') ||
            filterMatch('brave')) && (
            <div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#9c27b0',
                  textTransform: 'uppercase',
                  letterSpacing: '0.8px',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Sparkles size={13} /> Tile + WebChat Split Combinations
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
                  gap: '10px'
                }}
              >
                {[
                  {
                    title: 'Code & Chat (50/50 Split)',
                    desc: 'Terminal on Left + WebChat / Brave on Right',
                    icon: <Columns2 size={16} color="#8baeff" />,
                    preset: 'code-chat' as LayoutPresetType
                  },
                  {
                    title: '2 Terminals Left + 1 WebChat Right',
                    desc: 'Stacked code terminals beside full-height web research',
                    icon: <Columns3 size={16} color="#4caf50" />,
                    preset: 'code-2-chat-1' as LayoutPresetType
                  },
                  {
                    title: '1 Terminal Left + 2 WebChats Right',
                    desc: 'Code terminal beside dual AI screens (e.g. Brave + Claude)',
                    icon: <Columns3 size={16} color="#ff9800" />,
                    preset: 'code-1-chat-2' as LayoutPresetType
                  },
                  {
                    title: 'Quad Split (2 Code Top + 2 Web Bottom)',
                    desc: '2x2 grid combining 2 terminals with 2 web chats',
                    icon: <LayoutGrid size={16} color="#e91e63" />,
                    preset: 'quad-code-chat' as LayoutPresetType
                  },
                  {
                    title: '3-Way Split: Code | Brave | AI Chat',
                    desc: 'Terminal (33%) + Brave Browser (33%) + AI Assistant (33%)',
                    icon: <Columns3 size={16} color="#9c27b0" />,
                    preset: 'tri-code-brave-chat' as LayoutPresetType
                  }
                ].map((item) => (
                  <button
                    key={item.title}
                    onClick={() => {
                      onApplyLayoutPreset(item.preset)
                      onClose()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '10px',
                      color: '#eee',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(117, 157, 255, 0.08)'
                      e.currentTarget.style.borderColor = 'rgba(117, 157, 255, 0.35)'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)'
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
                      e.currentTarget.style.transform = 'none'
                    }}
                  >
                    <div
                      style={{
                        padding: '8px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        display: 'flex'
                      }}
                    >
                      {item.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                        {item.desc}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
