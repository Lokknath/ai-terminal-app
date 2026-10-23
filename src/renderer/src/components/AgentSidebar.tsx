import { useEffect, useState, useRef, useMemo } from 'react'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CheckSquare,
  Command,
  ExternalLink,
  Globe2,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Radio,
  Send,
  Settings2,
  Square,
  TerminalSquare,
  Trash2,
  Edit2,
  FolderOpen
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { getProviderCliCommand, type AIAccount } from '../types'

type SidebarTab = 'sessions' | 'swarm' | 'accounts' | 'cli'

interface AgentSidebarProps {
  onLaunchCLI: (command: string, name: string) => void
  onOpenAccount: (account: AIAccount) => void
  onCloseSession?: (id: string) => void
  onRenameSession?: (id: string, name: string) => void
  onOpenTerminalWithAccount?: (account: AIAccount, cwd?: string) => void
  onOpenFolderPickerForAccount?: (account: AIAccount) => void
  onNewTerminal?: () => void
}

const cliTools = [
  { id: 'claude-cli', cmd: 'claude', name: 'Claude Code' },
  { id: 'codex-cli', cmd: 'codex', name: 'Codex CLI' },
  { id: 'agy-cli', cmd: 'agy', name: 'Antigravity CLI' },
  { id: 'cursor-cli', cmd: 'cursor', name: 'Cursor Agent' },
  { id: 'gh-copilot', cmd: 'gh', name: 'GitHub CLI' }
]

export default function AgentSidebar({
  onLaunchCLI,
  onOpenAccount,
  onCloseSession,
  onRenameSession,
  onOpenTerminalWithAccount,
  onOpenFolderPickerForAccount,
  onNewTerminal
}: AgentSidebarProps): JSX.Element {
  const { state, dispatch } = useApp()
  const [tab, setTab] = useState<SidebarTab>('sessions')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [authStatus, setAuthStatus] = useState<Record<string, 'verified' | 'profile' | 'none'>>({})
  const [broadcastCmd, setBroadcastCmd] = useState('')
  const [broadcastFeedback, setBroadcastFeedback] = useState<string | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingSessionName, setEditingSessionName] = useState<string>('')
  const [selectedTerminalIds, setSelectedTerminalIds] = useState<string[] | null>(null)
  const [focusedTerminalIndex, setFocusedTerminalIndex] = useState<number>(0)
  const [swarmMode, setSwarmMode] = useState<'parallel' | 'sequential'>('parallel')
  const [swarmStatusFilter, setSwarmStatusFilter] = useState<
    'all' | 'waiting' | 'working' | 'idle'
  >('all')
  const [perTerminalInputs, setPerTerminalInputs] = useState<Record<string, string>>({})
  const [swarmHistory, setSwarmHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('nexus-swarm-history') || '[]')
    } catch {
      return []
    }
  })
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const swarmInputRef = useRef<HTMLInputElement>(null)

  const effectiveSelectedIds = useMemo(() => {
    const allIds = state.terminals.map((t) => t.id)
    if (selectedTerminalIds === null) return allIds
    return selectedTerminalIds.filter((id) => allIds.includes(id))
  }, [selectedTerminalIds, state.terminals])

  useEffect(() => {
    let active = true
    window.api
      .detectCLIAgents()
      .then((agents) => {
        if (active) {
          dispatch({ type: 'SET_DETECTED_CLIS', clis: agents.map((agent) => agent.providerId) })
          setLoadError(null)
        }
      })
      .catch(() => {
        if (active) setLoadError('Could not check installed CLI tools.')
      })
    return () => {
      active = false
    }
  }, [dispatch, retryKey])

  useEffect(() => {
    let active = true
    void Promise.all(
      state.aiAccounts.map(async (account) => {
        try {
          const auth = await window.api.getCLIAccountAuth(account)
          const status = auth.loggedIn
            ? auth.authMethod === 'profile-detected'
              ? 'profile'
              : 'verified'
            : 'none'
          return [account.id, status] as const
        } catch {
          return [account.id, 'none'] as const
        }
      })
    ).then((entries) => {
      if (active) setAuthStatus(Object.fromEntries(entries))
    })
    return () => {
      active = false
    }
  }, [state.aiAccounts])

  const showSession = (id: string): void => {
    dispatch({ type: 'UNDOCK_SESSION', id })
    dispatch({ type: 'SET_ACTIVE_SESSION', id })
  }

  const handleSwarmDispatch = (cmdToSend?: string): void => {
    const rawText = cmdToSend !== undefined ? cmdToSend : broadcastCmd
    if (!rawText) return

    // Save to history if submitted from main input
    if (cmdToSend === undefined && rawText.trim()) {
      const nextHistory = [rawText, ...swarmHistory.filter((h) => h !== rawText)].slice(0, 50)
      setSwarmHistory(nextHistory)
      try {
        localStorage.setItem('nexus-swarm-history', JSON.stringify(nextHistory))
      } catch {
        /* storage full */
      }
      setHistoryIndex(-1)
      setBroadcastCmd('')
    }

    const targets = state.terminals.filter((t) => effectiveSelectedIds.includes(t.id))
    if (targets.length === 0) {
      setBroadcastFeedback('No terminals selected')
      setTimeout(() => setBroadcastFeedback(null), 2500)
      return
    }

    if (swarmMode === 'parallel') {
      targets.forEach((t, i) => {
        // Variable interpolation: ${INDEX}, ${ID}, ${NAME}
        const interpolated = rawText
          .replace(/\$\{INDEX\}/g, String(i + 1))
          .replace(/\$\{ID\}/g, t.id)
          .replace(/\$\{NAME\}/g, t.name)
        const toSend =
          interpolated.endsWith('\r') || interpolated === '\x03'
            ? interpolated
            : `${interpolated}\r`
        window.electron.ipcRenderer.send('pty-write', t.id, toSend)
      })
      setBroadcastFeedback(
        `Dispatched to ${targets.length} terminal${targets.length > 1 ? 's' : ''} (Parallel)`
      )
    } else {
      // Sequential execution: dispatch with 250ms stagger
      targets.forEach((t, i) => {
        setTimeout(() => {
          const isStillActive = state.terminals.some((term) => term.id === t.id)
          if (!isStillActive) return
          const interpolated = rawText
            .replace(/\$\{INDEX\}/g, String(i + 1))
            .replace(/\$\{ID\}/g, t.id)
            .replace(/\$\{NAME\}/g, t.name)
          const toSend =
            interpolated.endsWith('\r') || interpolated === '\x03'
              ? interpolated
              : `${interpolated}\r`
          window.electron.ipcRenderer.send('pty-write', t.id, toSend)
        }, i * 250)
      })
      setBroadcastFeedback(`Running sequentially across ${targets.length} terminals`)
    }
    setTimeout(() => setBroadcastFeedback(null), 2800)
  }

  const handleSendToSingleTerminal = (terminalId: string, cmd: string): void => {
    if (!cmd.trim()) return
    const toSend = cmd.endsWith('\r') ? cmd : `${cmd}\r`
    window.electron.ipcRenderer.send('pty-write', terminalId, toSend)
    setPerTerminalInputs((prev) => ({ ...prev, [terminalId]: '' }))
    setBroadcastFeedback(`Sent to ${terminalId}`)
    setTimeout(() => setBroadcastFeedback(null), 2000)
  }

  const handleApproveTerminal = (terminalId: string): void => {
    window.electron.ipcRenderer.send('pty-write', terminalId, 'y\r')
    dispatch({
      type: 'UPDATE_TERMINAL_AGENT_STATE',
      id: terminalId,
      agentState: {
        status: 'working',
        promptQuestion: undefined,
        reason: 'Approved by user (swarm card)',
        lastActiveAt: Date.now()
      }
    })
    setBroadcastFeedback(`Approved ${terminalId} (y)`)
    setTimeout(() => setBroadcastFeedback(null), 2000)
  }

  const handleDenyTerminal = (terminalId: string): void => {
    window.electron.ipcRenderer.send('pty-write', terminalId, 'n\r')
    dispatch({
      type: 'UPDATE_TERMINAL_AGENT_STATE',
      id: terminalId,
      agentState: {
        status: 'idle',
        promptQuestion: undefined,
        reason: 'Denied by user (swarm card)',
        lastActiveAt: Date.now()
      }
    })
    setBroadcastFeedback(`Denied ${terminalId} (n)`)
    setTimeout(() => setBroadcastFeedback(null), 2000)
  }

  const handleApproveAllWaiting = (): void => {
    const waitingTerminals = state.terminals.filter(
      (t) => effectiveSelectedIds.includes(t.id) && t.agentState?.status === 'waiting'
    )
    if (waitingTerminals.length === 0) return
    waitingTerminals.forEach((t) => {
      window.electron.ipcRenderer.send('pty-write', t.id, 'y\r')
      dispatch({
        type: 'UPDATE_TERMINAL_AGENT_STATE',
        id: t.id,
        agentState: {
          status: 'working',
          promptQuestion: undefined,
          reason: 'Bulk approved by user',
          lastActiveAt: Date.now()
        }
      })
    })
    setBroadcastFeedback(`Approved all ${waitingTerminals.length} waiting agents`)
    setTimeout(() => setBroadcastFeedback(null), 2500)
  }

  const handleReorderTerminal = (id: string, direction: 'up' | 'down'): void => {
    const list = [...state.terminals]
    const idx = list.findIndex((t) => t.id === id)
    if (idx < 0) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= list.length) return
    const temp = list[idx]
    list[idx] = list[targetIdx]
    list[targetIdx] = temp
    dispatch({
      type: 'RESTORE_SESSIONS',
      terminals: list.map((t) => ({
        id: t.id,
        name: t.name,
        cwd: t.cwd,
        command: t.command,
        providerId: t.providerId,
        accountId: t.accountId
      })),
      dockedIds: state.dockedSessionIds
    })
  }

  return (
    <aside className="agent-sidebar" aria-label="Workspace sidebar">
      <div className="sidebar-top">
        <div className="sidebar-title-row">
          <span>Workspace</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              className="sidebar-icon-button"
              aria-label="New terminal"
              title="New terminal"
              onClick={onNewTerminal}
            >
              <Plus size={15} />
            </button>
            <button
              type="button"
              className="sidebar-icon-button"
              aria-label="Search and commands (⌘K)"
              title="Search and commands (⌘K)"
              onClick={() => dispatch({ type: 'SET_SHOW_PALETTE', show: true })}
            >
              <Command size={13} />
            </button>
            <button
              type="button"
              className="sidebar-icon-button"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            >
              <PanelLeftClose size={14} />
            </button>
          </div>
        </div>
        <nav className="sidebar-tabs" aria-label="Sidebar sections">
          {(
            [
              ['sessions', 'Sessions', state.terminals.length],
              ['swarm', 'Swarm', state.terminals.length],
              ['accounts', 'Accounts', state.aiAccounts.length],
              ['cli', 'CLI', state.detectedCLIs.length]
            ] as const
          ).map(([id, label, count]) => {
            const hasWaiting =
              id === 'swarm' && state.terminals.some((t) => t.agentState?.status === 'waiting')
            return (
              <button
                type="button"
                key={id}
                className={tab === id ? 'is-active' : ''}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id)}
              >
                <span style={hasWaiting ? { color: '#f59e0b', fontWeight: 600 } : undefined}>
                  {label}
                </span>
                <span
                  className="sidebar-count"
                  style={
                    hasWaiting
                      ? { backgroundColor: 'rgba(245, 158, 11, 0.25)', color: '#f59e0b' }
                      : undefined
                  }
                >
                  {count}
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      {loadError && (
        <div className="sidebar-feedback" role="alert">
          {loadError}
          <button type="button" onClick={() => setRetryKey((key) => key + 1)}>
            Retry
          </button>
        </div>
      )}

      <div className="sidebar-body">
        {tab === 'sessions' && (
          <section aria-label="Open sessions">
            <div className="sidebar-section-heading">
              <span>Open sessions</span>
              <span>{state.terminals.length}</span>
            </div>
            {state.terminals.length === 0 ? (
              <div className="sidebar-empty">
                <TerminalSquare size={22} />
                <strong>No sessions yet</strong>
                <p>Create a terminal or web pane to get started.</p>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'SET_SHOW_PALETTE', show: true })}
                >
                  Open command menu
                </button>
              </div>
            ) : (
              state.terminals.map((session) => {
                const docked = state.dockedSessionIds.includes(session.id)
                const active = state.activeSessionId === session.id && state.viewMode === 'full'
                const web = session.providerId === 'web'
                return (
                  <div
                    key={session.id}
                    className={`session-row${active ? ' is-active' : ''}${docked ? ' is-docked' : ''}`}
                  >
                    <button
                      type="button"
                      className="session-main"
                      onClick={() => showSession(session.id)}
                      title={`Focus ${session.name}`}
                    >
                      <span className="session-type-icon">
                        {web ? <Globe2 size={16} /> : <TerminalSquare size={16} />}
                      </span>
                      <span className="session-details">
                        <strong>{session.name}</strong>
                        <small>
                          {docked
                            ? 'Docked'
                            : web
                              ? 'Web pane'
                              : session.cwd === '~'
                                ? 'Home directory'
                                : session.cwd}
                        </small>
                      </span>
                    </button>
                    <div className="session-actions">
                      <button
                        type="button"
                        aria-label={
                          docked ? `Restore ${session.name} to workspace` : `Dock ${session.name}`
                        }
                        title={docked ? 'Restore to workspace' : 'Dock to sidebar'}
                        onClick={() =>
                          dispatch({
                            type: docked ? 'UNDOCK_SESSION' : 'DOCK_SESSION',
                            id: session.id
                          })
                        }
                      >
                        {docked ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
                      </button>
                      <button
                        type="button"
                        className="danger-action"
                        aria-label={`Close ${session.name}`}
                        title="Close session"
                        onClick={() => onCloseSession?.(session.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </section>
        )}

        {tab === 'swarm' && (
          <section
            aria-label="Agent Swarm Multiplexer"
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
          >
            <div className="sidebar-section-heading">
              <span>Swarm Multiplexer</span>
              <span>
                {state.terminals.filter((t) => t.agentState?.status === 'working').length} active /{' '}
                {state.terminals.filter((t) => t.agentState?.status === 'waiting').length} blocked
              </span>
            </div>

            {state.terminals.length === 0 ? (
              <div className="sidebar-empty">
                <Radio size={22} />
                <strong>No active swarm</strong>
                <p>Launch Claude, Codex, Antigravity, or Cursor to monitor agents in real-time.</p>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'SET_SHOW_PALETTE', show: true })}
                >
                  Open command menu
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  overflowY: 'auto',
                  flex: 1,
                  paddingBottom: '8px'
                }}
              >
                {/* Swarm Target Selection & Mode Toolbar */}
                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                      Targets: <strong style={{ color: '#fff' }}>{effectiveSelectedIds.length}</strong>/{state.terminals.length}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedTerminalIds(state.terminals.map((t) => t.id))}
                        style={{
                          fontSize: '10.5px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.14)',
                          color: '#cbd5e1',
                          cursor: 'pointer'
                        }}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedTerminalIds([])}
                        style={{
                          fontSize: '10.5px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.14)',
                          color: '#cbd5e1',
                          cursor: 'pointer'
                        }}
                      >
                        None
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const inverted = state.terminals
                            .filter((t) => !effectiveSelectedIds.includes(t.id))
                            .map((t) => t.id)
                          setSelectedTerminalIds(inverted)
                        }}
                        style={{
                          fontSize: '10.5px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.14)',
                          color: '#cbd5e1',
                          cursor: 'pointer'
                        }}
                      >
                        Invert
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '3px' }}>
                      {(['all', 'waiting', 'working', 'idle'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setSwarmStatusFilter(st)}
                          style={{
                            fontSize: '10.5px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: swarmStatusFilter === st ? '#4f46e5' : 'rgba(255,255,255,0.05)',
                            color: swarmStatusFilter === st ? '#fff' : '#94a3b8',
                            border: swarmStatusFilter === st ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.08)',
                            cursor: 'pointer',
                            textTransform: 'capitalize'
                          }}
                        >
                          {st === 'waiting' ? 'Blocked' : st}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setSwarmMode((prev) => (prev === 'parallel' ? 'sequential' : 'parallel'))
                      }
                      title="Toggle between Parallel (instant) and Sequential (staggered) execution"
                      style={{
                        fontSize: '10.5px',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        backgroundColor:
                          swarmMode === 'parallel'
                            ? 'rgba(6, 182, 212, 0.15)'
                            : 'rgba(245, 158, 11, 0.15)',
                        border: `1px solid ${
                          swarmMode === 'parallel'
                            ? 'rgba(6, 182, 212, 0.4)'
                            : 'rgba(245, 158, 11, 0.4)'
                        }`,
                        color: swarmMode === 'parallel' ? '#06b6d4' : '#f59e0b',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      {swarmMode === 'parallel' ? '⚡ Parallel' : '⏳ Sequential'}
                    </button>
                  </div>

                  {state.terminals.some(
                    (t) => effectiveSelectedIds.includes(t.id) && t.agentState?.status === 'waiting'
                  ) && (
                    <button
                      type="button"
                      onClick={handleApproveAllWaiting}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '5px 10px',
                        backgroundColor: '#10b981',
                        border: 'none',
                        borderRadius: '5px',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                      }}
                    >
                      <CheckSquare size={13} />
                      Approve All Waiting (
                      {
                        state.terminals.filter(
                          (t) => effectiveSelectedIds.includes(t.id) && t.agentState?.status === 'waiting'
                        ).length
                      }
                      )
                    </button>
                  )}
                </div>

                {/* Keyboard Navigation Tip */}
                <div
                  style={{
                    fontSize: '10px',
                    color: '#64748b',
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>↑ / ↓ or Alt+↑ / Alt+↓ to navigate</span>
                  <span>Space to toggle check</span>
                </div>

                {/* Terminals List with Arrow Steppers & Inline Command */}
                {state.terminals
                  .filter((session) => {
                    const st = session.agentState?.status || 'idle'
                    if (swarmStatusFilter === 'all') return true
                    return st === swarmStatusFilter
                  })
                  .map((session, index) => {
                    const agentStatus = session.agentState?.status || 'idle'
                    const question =
                      session.agentState?.promptQuestion || session.agentState?.question
                    const isBlocked = agentStatus === 'waiting'
                    const isWorking = agentStatus === 'working'
                    const isSelected = effectiveSelectedIds.includes(session.id)
                    const isHighlighted = focusedTerminalIndex === index

                    return (
                      <div
                        key={session.id}
                        tabIndex={0}
                        onFocus={() => setFocusedTerminalIndex(index)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault()
                            setFocusedTerminalIndex((prev) =>
                              Math.min(state.terminals.length - 1, prev + 1)
                            )
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault()
                            setFocusedTerminalIndex((prev) => Math.max(0, prev - 1))
                          } else if (e.key === ' ') {
                            e.preventDefault()
                            setSelectedTerminalIds((prev) => {
                              const current =
                                prev === null ? state.terminals.map((t) => t.id) : prev
                              return current.includes(session.id)
                                ? current.filter((id) => id !== session.id)
                                : [...current, session.id]
                            })
                          } else if (e.key === 'Enter') {
                            e.preventDefault()
                            showSession(session.id)
                          }
                        }}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '8px',
                          backgroundColor: isBlocked
                            ? 'rgba(245, 158, 11, 0.08)'
                            : isWorking
                              ? 'rgba(6, 182, 212, 0.06)'
                              : isHighlighted
                                ? 'rgba(255, 255, 255, 0.06)'
                                : 'rgba(255, 255, 255, 0.02)',
                          border: isHighlighted
                            ? '1px solid #6366f1'
                            : isBlocked
                              ? '1px solid rgba(245, 158, 11, 0.5)'
                              : isWorking
                                ? '1px solid rgba(6, 182, 212, 0.4)'
                                : '1px solid rgba(255, 255, 255, 0.07)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          outline: 'none',
                          transition: 'border-color 0.15s ease'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              minWidth: 0,
                              cursor: 'pointer'
                            }}
                            onClick={() => {
                              setSelectedTerminalIds((prev) => {
                                const current =
                                  prev === null ? state.terminals.map((t) => t.id) : prev
                                return current.includes(session.id)
                                  ? current.filter((id) => id !== session.id)
                                  : [...current, session.id]
                              })
                            }}
                          >
                            {isSelected ? (
                              <CheckSquare size={14} color="#6366f1" />
                            ) : (
                              <Square size={14} color="#64748b" />
                            )}
                            {editingSessionId === session.id ? (
                              <input
                                type="text"
                                value={editingSessionName}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setEditingSessionName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.stopPropagation()
                                    if (editingSessionName.trim()) {
                                      onRenameSession?.(session.id, editingSessionName.trim())
                                    }
                                    setEditingSessionId(null)
                                  } else if (e.key === 'Escape') {
                                    e.stopPropagation()
                                    setEditingSessionId(null)
                                  }
                                }}
                                onBlur={() => {
                                  if (editingSessionName.trim()) {
                                    onRenameSession?.(session.id, editingSessionName.trim())
                                  }
                                  setEditingSessionId(null)
                                }}
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  background: 'rgba(255,255,255,0.1)',
                                  border: '1px solid #6366f1',
                                  borderRadius: '3px',
                                  color: '#fff',
                                  padding: '1px 4px',
                                  maxWidth: '120px',
                                  outline: 'none'
                                }}
                              />
                            ) : (
                              <strong
                                onDoubleClick={(e) => {
                                  e.stopPropagation()
                                  setEditingSessionId(session.id)
                                  setEditingSessionName(session.name)
                                }}
                                title={`${session.name} (Double-click to rename)`}
                                style={{
                                  fontSize: '12.5px',
                                  fontWeight: 600,
                                  color: isSelected ? '#fff' : '#94a3b8',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  cursor: 'pointer'
                                }}
                              >
                                {session.name}
                              </strong>
                            )}
                            {onRenameSession && editingSessionId !== session.id && (
                              <button
                                type="button"
                                title="Rename session"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingSessionId(session.id)
                                  setEditingSessionName(session.name)
                                }}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#64748b',
                                  cursor: 'pointer',
                                  padding: '1px',
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                                onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
                                onMouseOut={(e) => (e.currentTarget.style.color = '#64748b')}
                              >
                                <Edit2 size={11} />
                              </button>
                            )}
                            {(() => {
                              const acc = state.aiAccounts.find((a) => a.id === session.accountId)
                              if (!acc) return null
                              const icon =
                                acc.providerId === 'claude'
                                  ? '🧠'
                                  : acc.providerId === 'chatgpt'
                                    ? '🤖'
                                    : acc.providerId === 'gemini' ||
                                        (acc.providerId as string) === 'antigravity'
                                      ? '💎'
                                      : '🦁'
                              return (
                                <span
                                  style={{
                                    fontSize: '9.5px',
                                    color: '#8baeff',
                                    backgroundColor: 'rgba(117, 157, 255, 0.12)',
                                    borderRadius: '3px',
                                    padding: '1px 5px',
                                    marginLeft: '2px',
                                    fontWeight: 500,
                                    whiteSpace: 'nowrap'
                                  }}
                                  title={`Linked account: ${acc.name}`}
                                >
                                  {icon} {acc.name}
                                </span>
                              )
                            })()}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {/* Up / Down Reorder Stepper Buttons */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleReorderTerminal(session.id, 'up')
                              }}
                              disabled={index === 0}
                              title="Move terminal up (▲)"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: index === 0 ? '#475569' : '#94a3b8',
                                cursor: index === 0 ? 'default' : 'pointer',
                                padding: '1px'
                              }}
                            >
                              <ArrowUp size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleReorderTerminal(session.id, 'down')
                              }}
                              disabled={index === state.terminals.length - 1}
                              title="Move terminal down (▼)"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: index === state.terminals.length - 1 ? '#475569' : '#94a3b8',
                                cursor:
                                  index === state.terminals.length - 1 ? 'default' : 'pointer',
                                padding: '1px'
                              }}
                            >
                              <ArrowDown size={12} />
                            </button>

                            {/* Status Pill */}
                            {isBlocked ? (
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 6px',
                                  borderRadius: '3px',
                                  backgroundColor: 'rgba(245, 158, 11, 0.25)',
                                  color: '#f59e0b',
                                  fontWeight: 700
                                }}
                              >
                                Blocked
                              </span>
                            ) : isWorking ? (
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 6px',
                                  borderRadius: '3px',
                                  backgroundColor: 'rgba(6, 182, 212, 0.2)',
                                  color: '#06b6d4',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                              >
                                <Loader2 size={10} className="animate-spin" /> Working
                              </span>
                            ) : agentStatus === 'done' ? (
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 6px',
                                  borderRadius: '3px',
                                  backgroundColor: 'rgba(16, 185, 129, 0.2)',
                                  color: '#10b981',
                                  fontWeight: 600
                                }}
                              >
                                ✓ Done
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 6px',
                                  borderRadius: '3px',
                                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                                  color: '#888'
                                }}
                              >
                                Idle
                              </span>
                            )}
                          </div>
                        </div>

                        {question && isBlocked && (
                          <div
                            style={{
                              backgroundColor: 'rgba(245, 158, 11, 0.12)',
                              border: '1px solid rgba(245, 158, 11, 0.4)',
                              borderRadius: '6px',
                              padding: '7px 9px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px'
                            }}
                          >
                            <div
                              style={{
                                fontSize: '11px',
                                fontFamily: 'ui-monospace, monospace',
                                color: '#fef3c7',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                maxHeight: '60px',
                                overflowY: 'auto'
                              }}
                            >
                              {question}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleApproveTerminal(session.id)
                                }}
                                title="Send 'y' to approve prompt"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  backgroundColor: '#10b981',
                                  border: 'none',
                                  color: '#fff',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                ✓ Allow (y)
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDenyTerminal(session.id)
                                }}
                                title="Send 'n' to reject prompt"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  backgroundColor: 'rgba(239, 68, 68, 0.25)',
                                  border: '1px solid rgba(239, 68, 68, 0.5)',
                                  color: '#f87171',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                ✗ Deny (n)
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Inline Per-Terminal Quick Command Bar */}
                        <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                          <input
                            type="text"
                            value={perTerminalInputs[session.id] || ''}
                            onChange={(e) =>
                              setPerTerminalInputs((prev) => ({
                                ...prev,
                                [session.id]: e.target.value
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleSendToSingleTerminal(
                                  session.id,
                                  perTerminalInputs[session.id] || ''
                                )
                              }
                            }}
                            placeholder={`Cmd to ${session.name}... ↵`}
                            style={{
                              flex: 1,
                              backgroundColor: 'rgba(0, 0, 0, 0.35)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              fontSize: '11px',
                              color: '#fff',
                              outline: 'none'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleSendToSingleTerminal(
                                session.id,
                                perTerminalInputs[session.id] || ''
                              )
                            }
                            disabled={!perTerminalInputs[session.id]?.trim()}
                            title="Send command directly to this terminal only"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              backgroundColor: perTerminalInputs[session.id]?.trim()
                                ? '#4f46e5'
                                : 'rgba(255, 255, 255, 0.06)',
                              color: '#fff',
                              border: 'none',
                              fontSize: '11px',
                              cursor: perTerminalInputs[session.id]?.trim() ? 'pointer' : 'default',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <Send size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => showSession(session.id)}
                            title="Focus terminal in main workspace"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              color: '#93c5fd',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            View
                          </button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}

            {/* Persistent Swarm Controller with Up/Down Arrow History */}
            <div
              style={{
                marginTop: 'auto',
                paddingTop: '10px',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '11.5px',
                  color: '#94a3b8'
                }}
              >
                <span
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600 }}
                >
                  <Radio size={13} color="#06b6d4" /> Swarm Commander
                </span>
                <div
                  style={{
                    display: 'flex',
                    gap: '4px',
                    flexWrap: 'wrap',
                    justifyContent: 'flex-end'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      handleSwarmDispatch('y\r')
                      state.terminals
                        .filter(
                          (t) =>
                            effectiveSelectedIds.includes(t.id) && t.agentState?.status === 'waiting'
                        )
                        .forEach((t) => {
                          dispatch({
                            type: 'UPDATE_TERMINAL_AGENT_STATE',
                            id: t.id,
                            agentState: {
                              status: 'working',
                              promptQuestion: undefined,
                              reason: 'Bulk approved (quick y)',
                              lastActiveAt: Date.now()
                            }
                          })
                        })
                    }}
                    title="Send 'y' (Allow) to selected terminals"
                    style={{
                      fontSize: '10.5px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(16, 185, 129, 0.2)',
                      border: '1px solid rgba(16, 185, 129, 0.45)',
                      color: '#34d399',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    ✓ y
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleSwarmDispatch('n\r')
                      state.terminals
                        .filter(
                          (t) =>
                            effectiveSelectedIds.includes(t.id) && t.agentState?.status === 'waiting'
                        )
                        .forEach((t) => {
                          dispatch({
                            type: 'UPDATE_TERMINAL_AGENT_STATE',
                            id: t.id,
                            agentState: {
                              status: 'idle',
                              promptQuestion: undefined,
                              reason: 'Bulk denied (quick n)',
                              lastActiveAt: Date.now()
                            }
                          })
                        })
                    }}
                    title="Send 'n' (Deny) to selected terminals"
                    style={{
                      fontSize: '10.5px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: '#f87171',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    ✗ n
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwarmDispatch('clear\r')}
                    title="Send clear to selected terminals"
                    style={{
                      fontSize: '10.5px',
                      padding: '2px 5px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      color: '#cbd5e1',
                      cursor: 'pointer'
                    }}
                  >
                    clear
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwarmDispatch('git status\r')}
                    title="Send git status to selected terminals"
                    style={{
                      fontSize: '10.5px',
                      padding: '2px 5px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      color: '#cbd5e1',
                      cursor: 'pointer'
                    }}
                  >
                    git
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwarmDispatch('\x03')}
                    title="Send Ctrl+C to selected terminals"
                    style={{
                      fontSize: '10.5px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    ^C Stop
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwarmDispatch('\r')}
                    title="Send Enter to selected terminals"
                    style={{
                      fontSize: '10.5px',
                      padding: '2px 5px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.18)',
                      color: '#e2e8f0',
                      cursor: 'pointer'
                    }}
                  >
                    ↵ Enter
                  </button>
                </div>
              </div>

              {/* Swarm Command Form with Up / Down Arrow History & Alt+Arrow Selection */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSwarmDispatch()
                }}
                style={{ display: 'flex', gap: '6px' }}
              >
                <input
                  ref={swarmInputRef}
                  type="text"
                  value={broadcastCmd}
                  onChange={(e) => setBroadcastCmd(e.target.value)}
                  onKeyDown={(e) => {
                    // Alt+ArrowUp / Alt+ArrowDown shifts targeted terminal index
                    if (e.altKey && e.key === 'ArrowUp') {
                      e.preventDefault()
                      setFocusedTerminalIndex((prev) => Math.max(0, prev - 1))
                      return
                    }
                    if (e.altKey && e.key === 'ArrowDown') {
                      e.preventDefault()
                      setFocusedTerminalIndex((prev) =>
                        Math.min(state.terminals.length - 1, prev + 1)
                      )
                      return
                    }

                    // Command history recall with ArrowUp and ArrowDown
                    if (e.key === 'ArrowUp') {
                      if (swarmHistory.length === 0) return
                      e.preventDefault()
                      const nextIdx = Math.min(swarmHistory.length - 1, historyIndex + 1)
                      setHistoryIndex(nextIdx)
                      setBroadcastCmd(swarmHistory[nextIdx])
                    } else if (e.key === 'ArrowDown') {
                      if (historyIndex <= 0) {
                        setHistoryIndex(-1)
                        setBroadcastCmd('')
                      } else {
                        e.preventDefault()
                        const nextIdx = historyIndex - 1
                        setHistoryIndex(nextIdx)
                        setBroadcastCmd(swarmHistory[nextIdx])
                      }
                    }
                  }}
                  placeholder="Broadcast or use ${INDEX}, ${NAME}... (↑/↓ history)"
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '11.5px',
                    color: '#fff',
                    outline: 'none'
                  }}
                />
                <button
                  type="submit"
                  disabled={!broadcastCmd.trim() || effectiveSelectedIds.length === 0}
                  style={{
                    backgroundColor:
                      broadcastCmd.trim() && effectiveSelectedIds.length > 0
                        ? '#4f46e5'
                        : 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor:
                      broadcastCmd.trim() && effectiveSelectedIds.length > 0
                        ? 'pointer'
                        : 'default',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title={`Send to ${effectiveSelectedIds.length} selected terminal${
                    effectiveSelectedIds.length > 1 ? 's' : ''
                  }`}
                >
                  <Send size={13} />
                </button>
              </form>

              {broadcastFeedback && (
                <span
                  style={{
                    fontSize: '11px',
                    color: '#10b981',
                    textAlign: 'center',
                    fontWeight: 600,
                    animation: 'fadeIn 0.2s ease'
                  }}
                >
                  {broadcastFeedback}
                </span>
              )}
            </div>
          </section>
        )}

        {tab === 'accounts' && (
          <section aria-label="AI accounts">
            <div className="sidebar-section-heading">
              <span>AI accounts</span>
              <button
                type="button"
                onClick={() => dispatch({ type: 'SET_SHOW_SETTINGS', show: true })}
              >
                <Plus size={13} /> Add
              </button>
            </div>
            {state.aiAccounts.length === 0 ? (
              <div className="sidebar-empty">
                <Globe2 size={22} />
                <strong>No accounts added</strong>
                <p>Add an account to isolate its web session and CLI profile.</p>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'SET_SHOW_SETTINGS', show: true })}
                >
                  Manage accounts
                </button>
              </div>
            ) : (
              state.aiAccounts.map((account) => {
                const status = authStatus[account.id] || 'none'
                const command = getProviderCliCommand(account.providerId)
                return (
                  <div key={account.id} className="account-row">
                    <div className="account-avatar" aria-hidden="true">
                      {account.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="account-details">
                      <strong>{account.name}</strong>
                      <small className={`account-status status-${status}`}>
                        {status === 'verified'
                          ? 'CLI signed in'
                          : status === 'profile'
                            ? 'Profile found'
                            : 'Web sign-in available'}
                      </small>
                    </div>
                    <div className="account-actions">
                      {command && onOpenTerminalWithAccount && (
                        <button
                          type="button"
                          aria-label={`Open ${account.name} terminal`}
                          title="Open CLI terminal in Home (~)"
                          onClick={() => onOpenTerminalWithAccount(account)}
                        >
                          <TerminalSquare size={15} />
                        </button>
                      )}
                      {command && onOpenFolderPickerForAccount && (
                        <button
                          type="button"
                          aria-label={`Open ${account.name} terminal in folder`}
                          title="Open in specific workspace folder..."
                          onClick={() => onOpenFolderPickerForAccount(account)}
                          style={{ color: '#e5c07b' }}
                        >
                          <FolderOpen size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Open ${account.name} web pane`}
                        title="Open web pane"
                        onClick={() => onOpenAccount(account)}
                      >
                        <ExternalLink size={15} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </section>
        )}

        {tab === 'cli' && (
          <section aria-label="Installed CLI tools">
            <div className="sidebar-section-heading">
              <span>Installed tools</span>
              <span>{state.detectedCLIs.length} found</span>
            </div>
            <div className="sidebar-tool-list">
              {cliTools.map((tool) => {
                const available = state.detectedCLIs.includes(tool.id)
                return (
                  <button
                    type="button"
                    key={tool.id}
                    className="tool-row"
                    disabled={!available}
                    onClick={() => onLaunchCLI(tool.cmd, tool.name)}
                  >
                    <TerminalSquare size={16} />
                    <span>
                      <strong>{tool.name}</strong>
                      <small>{tool.cmd}</small>
                    </span>
                    <span className={available ? 'tool-indicator is-ready' : 'tool-indicator'}>
                      {available ? 'Launch' : 'Not found'}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </div>

      <div className="sidebar-footer">
        <button type="button" onClick={() => dispatch({ type: 'SET_SHOW_PALETTE', show: true })}>
          <Command size={15} />
          <span>Commands</span>
          <kbd>⌘K</kbd>
        </button>
        <button
          type="button"
          aria-label="Open usage dashboard"
          title="Usage dashboard"
          className={state.mode === 'usage' ? 'is-active' : ''}
          onClick={() => dispatch({ type: 'SET_MODE', mode: 'usage' })}
        >
          <Activity size={16} />
        </button>
        <button
          type="button"
          aria-label="Manage accounts and settings"
          title="Settings"
          onClick={() => dispatch({ type: 'SET_SHOW_SETTINGS', show: true })}
        >
          <Settings2 size={16} />
        </button>
      </div>
    </aside>
  )
}
