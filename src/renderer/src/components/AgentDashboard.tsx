import { useState } from 'react'
import {
  TerminalSquare,
  Compass,
  NotebookPen,
  Send,
  Star,
  ExternalLink,
  Plus,
  AlertCircle,
  Copy,
  Check,
  ArrowUpRight
} from 'lucide-react'
import { useApp, type TerminalSession } from '../store/AppContext'
import { AIAccount } from '../types'
import { SubscriptionBadge } from './SubscriptionBadge'

function SwarmTerminalCard({
  terminal,
  onFocus
}: {
  terminal: TerminalSession
  onFocus: () => void
}): JSX.Element {
  const isWaiting = terminal.agentState?.status === 'waiting'
  const isWorking = terminal.agentState?.status === 'working'
  const isDone = terminal.agentState?.status === 'done'
  const [copied, setCopied] = useState(false)

  const handleApprove = (e: React.MouseEvent): void => {
    e.stopPropagation()
    window.electron.ipcRenderer.send('pty-write', terminal.id, 'y\r')
  }

  const handleDeny = (e: React.MouseEvent): void => {
    e.stopPropagation()
    window.electron.ipcRenderer.send('pty-write', terminal.id, 'n\r')
  }

  const copyCwd = (e: React.MouseEvent): void => {
    e.stopPropagation()
    navigator.clipboard.writeText(terminal.cwd || '~').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const statusColor = isWaiting ? '#f59e0b' : isWorking ? '#10b981' : isDone ? '#38bdf8' : '#94a3b8'
  const statusLabel = isWaiting
    ? 'Blocked on Input'
    : isWorking
      ? 'Working...'
      : isDone
        ? 'Completed'
        : 'Idle'

  return (
    <div
      className="nexus-account-card"
      style={{
        borderColor: isWaiting ? 'rgba(245, 158, 11, 0.5)' : undefined,
        backgroundColor: isWaiting ? 'rgba(245, 158, 11, 0.05)' : undefined,
        cursor: 'pointer'
      }}
      onClick={onFocus}
    >
      <div
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: statusColor,
          boxShadow: isWaiting || isWorking ? `0 0 10px ${statusColor}` : 'none'
        }}
      />
      <div className="nexus-account-card-info" style={{ flex: 1, minWidth: 0 }}>
        <div className="nexus-account-card-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <strong style={{ fontSize: '13px' }}>{terminal.name}</strong>
          <span
            style={{
              fontSize: '11px',
              padding: '1px 6px',
              borderRadius: '12px',
              backgroundColor: isWaiting
                ? 'rgba(245,158,11,0.2)'
                : isWorking
                  ? 'rgba(16,185,129,0.2)'
                  : 'rgba(255,255,255,0.06)',
              color: statusColor,
              fontWeight: 600
            }}
          >
            {statusLabel}
          </span>
          {terminal.command && (
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                color: '#94a3b8',
                backgroundColor: 'rgba(255,255,255,0.04)',
                padding: '1px 5px',
                borderRadius: '4px'
              }}
            >
              {terminal.command}
            </span>
          )}
        </div>

        {isWaiting && terminal.agentState?.promptQuestion && (
          <div
            style={{
              marginTop: '4px',
              fontSize: '12px',
              color: '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <AlertCircle size={13} color="#f59e0b" />
            <span>{terminal.agentState.promptQuestion}</span>
          </div>
        )}

        <div className="nexus-account-card-meta" style={{ marginTop: '4px' }}>
          <button
            type="button"
            onClick={copyCwd}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '11px',
              fontFamily: 'monospace',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: 0
            }}
            title="Click to copy path"
          >
            {copied ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
            <span>{terminal.cwd || '~'}</span>
          </button>
        </div>
      </div>

      <div className="nexus-account-card-actions" style={{ display: 'flex', gap: '6px' }}>
        {isWaiting ? (
          <>
            <button
              type="button"
              onClick={handleApprove}
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                borderColor: 'rgba(16, 185, 129, 0.5)',
                color: '#10b981',
                fontWeight: 600
              }}
              title="Send 'y' approval"
            >
              Approve (y)
            </button>
            <button
              type="button"
              onClick={handleDeny}
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                borderColor: 'rgba(239, 68, 68, 0.5)',
                color: '#ef4444',
                fontWeight: 600
              }}
              title="Send 'n' denial"
            >
              Deny (n)
            </button>
          </>
        ) : (
          <button type="button" onClick={onFocus} title="Jump to this terminal pane">
            <ArrowUpRight size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
            Open
          </button>
        )}
      </div>
    </div>
  )
}

interface AgentDashboardProps {
  onOpenAccount?: (account: { url: string; name: string; partition: string; id?: string }) => void
  onNewBrowser: () => void
  onLaunchCLI: (command: string, name: string, folder: string) => void
}

const tools = [
  { id: 'claude-cli', cmd: 'claude', name: 'Claude Code', detail: 'Coding agent' },
  { id: 'codex-cli', cmd: 'codex', name: 'Codex CLI', detail: 'Coding agent' },
  { id: 'agy-cli', cmd: 'agy', name: 'Antigravity CLI', detail: 'Coding agent' },
  { id: 'gh-copilot', cmd: 'gh', name: 'GitHub CLI', detail: 'Repository tools' },
  { id: 'cursor-cli', cmd: 'cursor', name: 'Cursor Agent', detail: 'Fast code intelligence' }
]

function AccountCard({
  account,
  onOpen
}: {
  account: AIAccount
  onOpen: () => void
}): JSX.Element {
  const icon =
    account.providerId === 'claude'
      ? '🧠'
      : account.providerId === 'chatgpt'
        ? '🤖'
        : account.providerId === 'gemini'
          ? '💎'
          : '🌐'

  return (
    <div className="nexus-account-card">
      <div style={{ fontSize: '20px', lineHeight: 1 }}>{icon}</div>
      <div className="nexus-account-card-info">
        <div className="nexus-account-card-name">
          <span>{account.name}</span>
          <SubscriptionBadge type={account.usage?.tier} />
          {account.isDefault && (
            <span
              style={{
                fontSize: '10px',
                color: '#ffd54f',
                backgroundColor: 'rgba(255, 213, 79, 0.12)',
                border: '1px solid rgba(255, 213, 79, 0.3)',
                padding: '1px 5px',
                borderRadius: '4px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <Star size={9} fill="#ffd54f" /> Default
            </span>
          )}
        </div>
        <div className="nexus-account-card-meta">
          <span>{account.url}</span>
          {account.cliConfigDir && (
            <>
              <span>•</span>
              <span style={{ fontFamily: 'monospace' }}>{account.cliConfigDir}</span>
            </>
          )}
        </div>
      </div>
      <div className="nexus-account-card-actions">
        <button
          type="button"
          onClick={onOpen}
          title={`Open ${account.name} Web Pane`}
        >
          <ExternalLink size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
          Open Web
        </button>
      </div>
    </div>
  )
}

export default function AgentDashboard({
  onOpenAccount,
  onNewBrowser,
  onLaunchCLI
}: AgentDashboardProps): JSX.Element {
  const { state, dispatch } = useApp()

  const workingCount = state.terminals.filter((t) => t.agentState?.status === 'working').length
  const waitingCount = state.terminals.filter((t) => t.agentState?.status === 'waiting').length
  const activeAgentCount = workingCount + waitingCount

  const launch = (command: string, name: string): void => {
    dispatch({
      type: 'OPEN_FOLDER_EXPLORER',
      title: `Select Working Directory for ${name}`,
      onSelect: (folder) => {
        onLaunchCLI(command, name, folder)
        dispatch({ type: 'SET_MODE', mode: 'code' })
      }
    })
  }

  return (
    <main className="nexus-dashboard">
      {/* ── Hero ── */}
      <div className="nexus-hero">
        <span className="section-overline">Nexus · Command Center</span>
        <h1>Build with every agent in one place.</h1>
        <div className="nexus-live-pills" aria-label="Workspace overview">
          {activeAgentCount > 0 && (
            <span className="live-pill is-active">
              <span className="live-dot" />
              {activeAgentCount} agent{activeAgentCount > 1 ? 's' : ''} active
            </span>
          )}
          <span className="live-pill">
            <strong>{state.aiAccounts.length}</strong> accounts
          </span>
          <span className="live-pill">
            <strong>{state.detectedCLIs.length}</strong> installed tools
          </span>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="nexus-quick-actions" aria-label="Quick Actions">
        <button
          type="button"
          className="nexus-quick-card"
          onClick={() => dispatch({ type: 'SET_MODE', mode: 'code' })}
        >
          <div className="nexus-quick-icon">
            <TerminalSquare size={18} />
          </div>
          <div>
            <strong>Code Workspace</strong>
            <small>Terminals & agents</small>
          </div>
        </button>

        <button type="button" className="nexus-quick-card" onClick={onNewBrowser}>
          <div className="nexus-quick-icon">
            <Compass size={18} />
          </div>
          <div>
            <strong>Research Browser</strong>
            <small>Explore & docs</small>
          </div>
        </button>

        <button
          type="button"
          className="nexus-quick-card"
          onClick={() => dispatch({ type: 'SET_MODE', mode: 'notes' })}
        >
          <div className="nexus-quick-icon">
            <NotebookPen size={18} />
          </div>
          <div>
            <strong>Notes</strong>
            <small>Ideas & context</small>
          </div>
        </button>

        <button
          type="button"
          className="nexus-quick-card"
          onClick={() => dispatch({ type: 'SET_MODE', mode: 'api' })}
        >
          <div className="nexus-quick-icon">
            <Send size={18} />
          </div>
          <div>
            <strong>API Studio</strong>
            <small>Test endpoints</small>
          </div>
        </button>
      </div>

      {/* ── Active Swarm Terminals Section ── */}
      <section className="nexus-section" aria-labelledby="swarm-header">
        <div className="nexus-section-header">
          <h2 id="swarm-header">Active Swarm Terminals</h2>
          <span>{state.terminals.length}</span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_MODE', mode: 'code' })}
          >
            <TerminalSquare size={12} style={{ marginRight: '3px', verticalAlign: '-1px' }} />
            Open Grid View (⌘1)
          </button>
        </div>

        {state.terminals.length === 0 ? (
          <div className="nexus-empty">
            No active terminal sessions in the swarm. Launch one from CLI Tools below or press ⌘T.
          </div>
        ) : (
          <div className="nexus-account-list">
            {state.terminals.map((terminal) => (
              <SwarmTerminalCard
                key={terminal.id}
                terminal={terminal}
                onFocus={() => {
                  dispatch({ type: 'UNDOCK_SESSION', id: terminal.id })
                  dispatch({ type: 'SET_ACTIVE_SESSION', id: terminal.id })
                  dispatch({ type: 'SET_MODE', mode: 'code' })
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Web Accounts Section ── */}
      <section className="nexus-section" aria-labelledby="accounts-header">
        <div className="nexus-section-header">
          <h2 id="accounts-header">Web Accounts</h2>
          <span>{state.aiAccounts.length}</span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_SHOW_SETTINGS', show: true })}
          >
            <Plus size={12} style={{ marginRight: '3px', verticalAlign: '-1px' }} />
            Add
          </button>
        </div>

        {state.aiAccounts.length === 0 ? (
          <div className="nexus-empty">No accounts configured yet. Add one in Settings.</div>
        ) : (
          <div className="nexus-account-list">
            {state.aiAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onOpen={() => {
                  onOpenAccount?.(account)
                  dispatch({ type: 'SET_MODE', mode: 'code' })
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── CLI Tools Section ── */}
      <section className="nexus-section" aria-labelledby="cli-header">
        <div className="nexus-section-header">
          <h2 id="cli-header">CLI Tools</h2>
          <span>{state.detectedCLIs.length}</span>
        </div>

        <div className="nexus-tools-row">
          {tools.map((tool) => {
            const detected = state.detectedCLIs.includes(tool.id)
            return (
              <button
                key={tool.id}
                type="button"
                className={`nexus-tool-chip ${detected ? 'is-detected' : ''}`}
                title={
                  detected
                    ? `Click to choose directory and launch ${tool.name}`
                    : `Launch ${tool.name} terminal`
                }
                onClick={() => launch(tool.cmd, tool.name)}
              >
                <span className="tool-status">{detected ? '✓' : '—'}</span>
                <span>{tool.name}</span>
              </button>
            )
          })}
        </div>
      </section>
    </main>
  )
}
