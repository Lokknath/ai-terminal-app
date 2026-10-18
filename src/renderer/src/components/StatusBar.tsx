import { useState, useMemo } from 'react'
import {
  Terminal,
  Activity,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  Coffee,
  Command,
  Maximize2
} from 'lucide-react'
import { useApp } from '../store/AppContext'

interface StatusBarProps {
  onToggleSidebar?: () => void
  onOpenPalette?: () => void
  onNewTerminal?: () => void
  onToggleFocus?: () => void
}

export default function StatusBar({
  onToggleSidebar,
  onOpenPalette,
  onNewTerminal,
  onToggleFocus
}: StatusBarProps): JSX.Element {
  const { state, dispatch } = useApp()
  const [copiedPath, setCopiedPath] = useState(false)

  const activeTerminal = useMemo(
    () => state.terminals.find((t) => t.id === state.activeSessionId) || state.terminals[0],
    [state.terminals, state.activeSessionId]
  )

  const waitingTerminals = useMemo(
    () => state.terminals.filter((t) => t.agentState?.status === 'waiting'),
    [state.terminals]
  )
  const workingTerminals = useMemo(
    () => state.terminals.filter((t) => t.agentState?.status === 'working'),
    [state.terminals]
  )

  const activeAccount = useMemo(() => {
    if (!activeTerminal?.accountId) return null
    return state.aiAccounts.find((a) => a.id === activeTerminal.accountId)
  }, [state.aiAccounts, activeTerminal])

  const copyActivePath = (e: React.MouseEvent): void => {
    e.stopPropagation()
    const path = activeTerminal?.cwd || '~'
    navigator.clipboard.writeText(path).then(() => {
      setCopiedPath(true)
      setTimeout(() => setCopiedPath(false), 1800)
    })
  }

  const handleJumpToWaiting = (): void => {
    if (waitingTerminals.length > 0) {
      const currentIndex = waitingTerminals.findIndex((t) => t.id === state.activeSessionId)
      const nextIndex = (currentIndex + 1) % waitingTerminals.length
      const targetId = waitingTerminals[nextIndex].id
      dispatch({ type: 'SET_MODE', mode: 'code' })
      dispatch({ type: 'UNDOCK_SESSION', id: targetId })
      dispatch({ type: 'SET_ACTIVE_SESSION', id: targetId })
      dispatch({ type: 'SET_FOCUS_SESSION', id: targetId })
    }
  }

  const handleToggleKeepAwake = async (): Promise<void> => {
    const next = !state.keepAwake
    try {
      const active = await window.api.setKeepAwake(next)
      dispatch({ type: 'SET_KEEP_AWAKE', enabled: active })
    } catch {
      dispatch({ type: 'SET_KEEP_AWAKE', enabled: next })
    }
  }

  const modeLabel = useMemo(() => {
    switch (state.mode) {
      case 'code':
        return `Code (${state.viewMode})`
      case 'agent':
        return 'Agent Dashboard'
      case 'chat':
        return 'AI Chat'
      case 'api':
        return 'API Studio'
      case 'notes':
        return 'Notes'
      case 'usage':
        return 'Usage'
      default:
        return 'Workspace'
    }
  }, [state.mode, state.viewMode])

  return (
    <footer className="nexus-status-bar" role="status" aria-label="Application status">
      {/* Left: Terminal count & Swarm telemetry */}
      <div className="status-bar-section status-bar-left">
        <button
          type="button"
          className="status-bar-item status-bar-pill"
          onClick={onNewTerminal}
          title="Active sessions. Click to launch new terminal."
        >
          <Terminal size={12} color="#8baeff" />
          <span>
            {state.terminals.length} {state.terminals.length === 1 ? 'Session' : 'Sessions'}
          </span>
        </button>

        {waitingTerminals.length > 0 ? (
          <button
            type="button"
            className="status-bar-item status-bar-pill is-waiting animate-pulse"
            onClick={handleJumpToWaiting}
            title={`${waitingTerminals.length} agent(s) waiting for input/approval. Click to jump.`}
          >
            <AlertCircle size={12} color="#f59e0b" />
            <span>{waitingTerminals.length} Blocked</span>
          </button>
        ) : workingTerminals.length > 0 ? (
          <div
            className="status-bar-item status-bar-pill is-working"
            title={`${workingTerminals.length} agent(s) actively working.`}
          >
            <Loader2 size={12} className="animate-spin" color="#10b981" />
            <span>{workingTerminals.length} Working</span>
          </div>
        ) : (
          <div className="status-bar-item status-bar-pill is-idle" title="All agents idle">
            <span className="status-bar-dot" />
            <span>Swarm Ready</span>
          </div>
        )}

        <div className="status-bar-item status-mode-badge" title="Current workspace mode">
          <Activity size={11} />
          <span>{modeLabel}</span>
        </div>
      </div>

      {/* Center: Active Terminal Working Directory & AI Account */}
      <div className="status-bar-section status-bar-center">
        {activeTerminal && (
          <button
            type="button"
            className="status-bar-cwd-pill"
            onClick={copyActivePath}
            title="Click to copy active terminal working directory"
          >
            {copiedPath ? <Check size={11} color="#10b981" /> : <Copy size={11} color="#94a3b8" />}
            <span className="status-bar-path">{activeTerminal.cwd || '~'}</span>
            {copiedPath && <span className="status-bar-copied">Copied!</span>}
          </button>
        )}

        {activeAccount ? (
          <div
            className="status-bar-account-badge"
            title={`Active account: ${activeAccount.name} (${activeAccount.providerId})`}
          >
            <span>
              {activeAccount.providerId === 'claude'
                ? '🧠'
                : activeAccount.providerId === 'chatgpt'
                  ? '🤖'
                  : activeAccount.providerId === 'gemini' ||
                      (activeAccount.providerId as string) === 'antigravity'
                    ? '💎'
                    : '🦁'}
            </span>
            <span>{activeAccount.name}</span>
          </div>
        ) : activeTerminal ? (
          <div className="status-bar-account-badge" title="Standard shell without AI credentials">
            <span>🌐</span>
            <span>System Shell</span>
          </div>
        ) : null}
      </div>

      {/* Right: Keyboard Shortcuts Cheatsheet & Tools */}
      <div className="status-bar-section status-bar-right">
        <button
          type="button"
          className="status-bar-shortcut-btn"
          onClick={onOpenPalette}
          title="Command Menu (⌘K)"
        >
          <Command size={10} />
          <span>K</span>
        </button>

        <button
          type="button"
          className="status-bar-shortcut-btn"
          onClick={onToggleSidebar}
          title="Toggle Sidebar (⌘B)"
        >
          <Command size={10} />
          <span>B</span>
        </button>

        <button
          type="button"
          className="status-bar-shortcut-btn"
          onClick={onToggleFocus}
          title="Toggle Focus / Full (⌘⇧F)"
        >
          <Maximize2 size={10} />
        </button>

        <button
          type="button"
          className={`status-bar-tool-btn ${state.keepAwake ? 'is-active' : ''}`}
          onClick={handleToggleKeepAwake}
          title={
            state.keepAwake
              ? 'Keep-Awake Active (Sleep prevented)'
              : 'Keep-Awake Off (Click to prevent sleep)'
          }
        >
          <Coffee size={12} color={state.keepAwake ? '#f59e0b' : '#94a3b8'} />
        </button>
      </div>
    </footer>
  )
}
