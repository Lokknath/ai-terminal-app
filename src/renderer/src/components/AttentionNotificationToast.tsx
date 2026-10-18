import { useState } from 'react'
import { CheckCircle2, ChevronRight, ShieldAlert, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { useApp } from '../store/AppContext'

export default function AttentionNotificationToast(): JSX.Element | null {
  const { state, dispatch } = useApp()
  const [dismissedMap, setDismissedMap] = useState<Record<string, number>>({})

  // Find all terminals waiting for input or newly completed
  const activeAlerts = state.terminals.filter((t) => {
    const status = t.agentState?.status
    if (status !== 'waiting' && status !== 'done') return false
    const dismissedAt = dismissedMap[t.id]
    if (dismissedAt && (t.agentState?.lastActiveAt || 0) <= dismissedAt) return false
    return true
  })

  if (activeAlerts.length === 0) return null

  // Show the most urgent alert (waiting > done, then most recently active)
  const sortedAlerts = [...activeAlerts].sort((a, b) => {
    if (a.agentState?.status === 'waiting' && b.agentState?.status !== 'waiting') return -1
    if (b.agentState?.status === 'waiting' && a.agentState?.status !== 'waiting') return 1
    return (b.agentState?.lastActiveAt || 0) - (a.agentState?.lastActiveAt || 0)
  })

  const target = sortedAlerts[0]
  const isWaiting = target.agentState?.status === 'waiting'

  // Determine provider subscription details
  const matchedAccount = state.aiAccounts.find(
    (acc) => acc.id === target.accountId || acc.providerId === target.providerId
  )
  const providerLabel = (() => {
    if (target.providerId === 'claude') return 'Claude Pro'
    if (target.providerId === 'chatgpt') return 'ChatGPT Plus'
    if (target.providerId === 'gemini') return 'Gemini Advanced'
    if (matchedAccount) return matchedAccount.name
    return target.providerId ? target.providerId.toUpperCase() : 'AI Agent'
  })()

  const providerColor = (() => {
    if (target.providerId === 'claude') return '#d97706'
    if (target.providerId === 'chatgpt') return '#10b981'
    if (target.providerId === 'gemini') return '#818cf8'
    return '#38bdf8'
  })()

  const handleApprove = (): void => {
    window.electron.ipcRenderer.send(`pty-in-${target.id}`, 'y\r')
    dispatch({
      type: 'UPDATE_TERMINAL_AGENT_STATE',
      id: target.id,
      agentState: {
        status: 'working',
        lastActiveAt: Date.now(),
        promptQuestion: undefined
      }
    })
    setDismissedMap((prev) => ({ ...prev, [target.id]: Date.now() }))
  }

  const handleDeny = (): void => {
    window.electron.ipcRenderer.send(`pty-in-${target.id}`, 'n\r')
    dispatch({
      type: 'UPDATE_TERMINAL_AGENT_STATE',
      id: target.id,
      agentState: {
        status: 'idle',
        lastActiveAt: Date.now(),
        promptQuestion: undefined
      }
    })
    setDismissedMap((prev) => ({ ...prev, [target.id]: Date.now() }))
  }

  const handleJump = (): void => {
    dispatch({ type: 'SET_MODE', mode: 'code' })
    dispatch({ type: 'UNDOCK_SESSION', id: target.id })
    dispatch({ type: 'SET_ACTIVE_SESSION', id: target.id })
    dispatch({ type: 'SET_FOCUS_SESSION', id: target.id })
  }

  const handleDismiss = (): void => {
    setDismissedMap((prev) => ({ ...prev, [target.id]: Date.now() }))
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: '56px',
        right: '20px',
        zIndex: 900,
        width: '380px',
        maxWidth: 'calc(100vw - 40px)',
        backgroundColor: '#161922',
        border: `1px solid ${isWaiting ? 'rgba(245, 158, 11, 0.45)' : 'rgba(16, 185, 129, 0.4)'}`,
        borderRadius: '10px',
        padding: '14px 16px',
        boxShadow: isWaiting
          ? '0 12px 32px rgba(245, 158, 11, 0.2), 0 4px 12px rgba(0,0,0,0.6)'
          : '0 12px 32px rgba(16, 185, 129, 0.15), 0 4px 12px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        backdropFilter: 'blur(8px)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isWaiting ? (
            <ShieldAlert size={18} color="#f59e0b" />
          ) : (
            <CheckCircle2 size={18} color="#10b981" />
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '4px',
                  backgroundColor: `${providerColor}22`,
                  color: providerColor,
                  border: `1px solid ${providerColor}44`,
                  letterSpacing: '0.3px',
                  textTransform: 'uppercase'
                }}
              >
                {providerLabel}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
                {target.name}
              </span>
            </div>
            {matchedAccount?.googleEmail && (
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {matchedAccount.googleEmail}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          title="Dismiss notification"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex'
          }}
        >
          <X size={15} />
        </button>
      </div>

      <div
        style={{
          fontSize: '12px',
          color: '#cbd5e1',
          lineHeight: 1.45,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          padding: '8px 10px',
          borderRadius: '6px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          wordBreak: 'break-word',
          fontFamily: isWaiting ? 'ui-monospace, monospace' : 'inherit'
        }}
      >
        {isWaiting
          ? target.agentState?.promptQuestion || 'An action requires permission to proceed'
          : 'Task execution completed successfully'}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <button
          type="button"
          onClick={handleJump}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            fontSize: '11.5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            padding: 0
          }}
        >
          View terminal <ChevronRight size={13} />
        </button>

        {isWaiting ? (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={handleDeny}
              title="Deny / Reject command (n)"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                color: '#f87171',
                padding: '4px 10px',
                borderRadius: '5px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <ThumbsDown size={12} /> Deny
            </button>
            <button
              type="button"
              onClick={handleApprove}
              title="Approve / Allow command (y)"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.25)',
                border: '1px solid rgba(16, 185, 129, 0.55)',
                color: '#34d399',
                padding: '4px 12px',
                borderRadius: '5px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <ThumbsUp size={12} /> Approve
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleDismiss}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#e2e8f0',
              padding: '4px 10px',
              borderRadius: '5px',
              fontSize: '11.5px',
              cursor: 'pointer'
            }}
          >
            Dismiss
          </button>
        )}
      </div>

      {activeAlerts.length > 1 && (
        <div
          style={{ fontSize: '10.5px', color: '#64748b', textAlign: 'center', marginTop: '-4px' }}
        >
          +{activeAlerts.length - 1} other agent notification
          {activeAlerts.length - 1 > 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
