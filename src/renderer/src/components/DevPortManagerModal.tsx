import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Search, RotateCw, Trash2, Radio, Check, Server } from 'lucide-react'
import { ListeningPort } from '../../../preload'
import { useDialogFocus } from '../hooks/useDialogFocus'

interface DevPortManagerModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function DevPortManagerModal({
  isOpen,
  onClose
}: DevPortManagerModalProps): JSX.Element | null {
  const [ports, setPorts] = useState<ListeningPort[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [killedPids, setKilledPids] = useState<Record<number, boolean>>({})
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useDialogFocus(dialogRef, onClose)

  const refreshPorts = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const data = await window.api.getListeningPorts()
      setPorts(data)
    } catch (err) {
      console.error('Failed to fetch listening ports:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      refreshPorts()
      setKilledPids({})
      setStatusMessage(null)
    }
  }, [isOpen, refreshPorts])

  if (!isOpen) return null

  const handleKill = async (port: ListeningPort): Promise<void> => {
    try {
      const success = await window.api.killPortProcess(port.pid)
      if (success) {
        setKilledPids((prev) => ({ ...prev, [port.pid]: true }))
        setStatusMessage(`Killed PID ${port.pid} (${port.command}) on port :${port.port}`)
        setTimeout(() => {
          refreshPorts()
        }, 350)
      } else {
        setStatusMessage(`Failed to kill PID ${port.pid} (may require root/sudo permission)`)
      }
    } catch {
      setStatusMessage(`Error killing PID ${port.pid}`)
    }
  }

  const isDevPort = (portNum: number): boolean => {
    return (
      (portNum >= 3000 && portNum <= 3010) ||
      (portNum >= 5170 && portNum <= 5180) ||
      (portNum >= 8000 && portNum <= 8090) ||
      (portNum >= 4000 && portNum <= 4010) ||
      portNum === 8888 ||
      portNum === 9000 ||
      portNum === 19842
    )
  }

  const filteredPorts = ports.filter((p) => {
    const q = search.toLowerCase()
    return (
      p.port.toString().includes(q) ||
      p.command.toLowerCase().includes(q) ||
      p.pid.toString().includes(q) ||
      p.user.toLowerCase().includes(q)
    )
  })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="port-manager-title"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '85vh',
          backgroundColor: '#12141c',
          border: '1px solid rgba(117, 157, 255, 0.25)',
          borderRadius: '12px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: '#161924'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(117, 157, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8baeff'
              }}
            >
              <Server size={18} />
            </div>
            <div>
              <h2
                id="port-manager-title"
                style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#fff' }}
              >
                Dev Port Manager & Process Killer
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#8892b0' }}>
                Inspect and instantly terminate runaway servers occupying ports
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={refreshPorts}
              disabled={loading}
              title="Refresh Ports"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '6px',
                padding: '6px 10px',
                color: '#8baeff',
                cursor: loading ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px'
              }}
            >
              <RotateCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center'
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            backgroundColor: '#141722',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#0d0f17',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '6px 12px'
            }}
          >
            <Search size={14} color="#666" />
            <input
              type="text"
              placeholder="Filter by port (e.g. 3000, 5173) or process name (e.g. node, vite)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#eee',
                fontSize: '12.5px',
                width: '100%'
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
                  padding: 0
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Status Alert Banner */}
        {statusMessage && (
          <div
            style={{
              padding: '8px 20px',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              borderBottom: '1px solid rgba(16, 185, 129, 0.25)',
              color: '#34d399',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Check size={14} />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Ports Table List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '10px 20px',
            minHeight: '260px'
          }}
        >
          {filteredPorts.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 0',
                color: '#666',
                gap: '8px'
              }}
            >
              <Radio size={28} color="#444" />
              <span style={{ fontSize: '13px' }}>
                {loading
                  ? 'Scanning listening ports...'
                  : 'No active listening ports match filter.'}
              </span>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <th style={{ padding: '8px', fontSize: '11px', color: '#778', fontWeight: 600 }}>
                    PORT
                  </th>
                  <th style={{ padding: '8px', fontSize: '11px', color: '#778', fontWeight: 600 }}>
                    COMMAND
                  </th>
                  <th style={{ padding: '8px', fontSize: '11px', color: '#778', fontWeight: 600 }}>
                    PID
                  </th>
                  <th style={{ padding: '8px', fontSize: '11px', color: '#778', fontWeight: 600 }}>
                    USER
                  </th>
                  <th
                    style={{
                      padding: '8px',
                      fontSize: '11px',
                      color: '#778',
                      fontWeight: 600,
                      textAlign: 'right'
                    }}
                  >
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPorts.map((p) => {
                  const isDev = isDevPort(p.port)
                  const isKilled = killedPids[p.pid]
                  return (
                    <tr
                      key={`${p.port}-${p.pid}`}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        backgroundColor: isKilled
                          ? 'rgba(239, 68, 68, 0.08)'
                          : isDev
                            ? 'rgba(117, 157, 255, 0.04)'
                            : 'transparent'
                      }}
                    >
                      <td style={{ padding: '10px 8px' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: isDev ? '#60a5fa' : '#eee',
                            backgroundColor: isDev
                              ? 'rgba(96, 165, 250, 0.15)'
                              : 'rgba(255, 255, 255, 0.06)',
                            padding: '2px 7px',
                            borderRadius: '4px'
                          }}
                        >
                          :{p.port}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: '12.5px', color: '#ddd' }}>
                        <span style={{ fontWeight: 500 }}>{p.command}</span>
                      </td>
                      <td
                        style={{
                          padding: '10px 8px',
                          fontSize: '12px',
                          color: '#8892b0',
                          fontFamily: 'monospace'
                        }}
                      >
                        {p.pid}
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: '12px', color: '#8892b0' }}>
                        {p.user}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleKill(p)}
                          disabled={isKilled}
                          style={{
                            backgroundColor: isKilled
                              ? 'rgba(255, 255, 255, 0.05)'
                              : 'rgba(239, 68, 68, 0.15)',
                            border: isKilled
                              ? '1px solid rgba(255, 255, 255, 0.1)'
                              : '1px solid rgba(239, 68, 68, 0.35)',
                            color: isKilled ? '#777' : '#f87171',
                            padding: '4px 10px',
                            borderRadius: '5px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: isKilled ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseOver={(e) => {
                            if (!isKilled) {
                              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.28)'
                            }
                          }}
                          onMouseOut={(e) => {
                            if (!isKilled) {
                              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'
                            }
                          }}
                        >
                          <Trash2 size={11} />
                          <span>{isKilled ? 'Killed' : 'Kill Port'}</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#161924',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11.5px',
            color: '#778'
          }}
        >
          <span>
            Highlighted ports indicate active development servers (3000, 5173, 8000, etc.)
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '6px',
              padding: '6px 14px',
              color: '#ddd',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
