import { useState, useRef } from 'react'
import { X, Search, Copy, Check, TerminalSquare, Key } from 'lucide-react'
import { useDialogFocus } from '../hooks/useDialogFocus'

interface EnvInspectorModalProps {
  isOpen: boolean
  onClose: () => void
  env: Record<string, string>
  title: string
}

export default function EnvInspectorModal({
  isOpen,
  onClose,
  env,
  title
}: EnvInspectorModalProps): JSX.Element | null {
  const [search, setSearch] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useDialogFocus(dialogRef, onClose)

  if (!isOpen) return null

  const envEntries = Object.entries(env || {}).sort(([a], [b]) => a.localeCompare(b))

  const filteredEntries = envEntries.filter(([key, val]) => {
    const q = search.toLowerCase()
    return key.toLowerCase().includes(q) || val.toLowerCase().includes(q)
  })

  const copyValue = (key: string, val: string): void => {
    navigator.clipboard.writeText(`${key}=${val}`)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  const copyAll = (): void => {
    const text = envEntries.map(([k, v]) => `${k}=${v}`).join('\n')
    navigator.clipboard.writeText(text)
    setCopiedKey('__ALL__')
    setTimeout(() => setCopiedKey(null), 1500)
  }

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
        aria-labelledby="env-inspector-title"
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
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#34d399'
              }}
            >
              <Key size={18} />
            </div>
            <div>
              <h2
                id="env-inspector-title"
                style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#fff' }}
              >
                Environment Variables: {title}
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#8892b0' }}>
                Profile-isolated sandbox configuration and exported variables
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={copyAll}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '6px',
                padding: '6px 10px',
                color: copiedKey === '__ALL__' ? '#10b981' : '#8baeff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px'
              }}
            >
              {copiedKey === '__ALL__' ? <Check size={13} /> : <Copy size={13} />}
              <span>{copiedKey === '__ALL__' ? 'Copied All!' : 'Copy All'}</span>
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

        {/* Filter Bar */}
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
              placeholder="Search variables by name or value..."
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

        {/* Variables List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 20px',
            minHeight: '260px'
          }}
        >
          {filteredEntries.length === 0 ? (
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
              <TerminalSquare size={28} color="#444" />
              <span style={{ fontSize: '13px' }}>
                {envEntries.length === 0
                  ? 'No custom environment variables specified for this session.'
                  : 'No variables match filter.'}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredEntries.map(([key, val]) => {
                const isCopied = copiedKey === key
                const isSpecial =
                  key.includes('DIR') ||
                  key.includes('HOME') ||
                  key.includes('KEY') ||
                  key.includes('TOKEN')
                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.07)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: '180px' }}>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: isSpecial ? '#60a5fa' : '#34d399'
                        }}
                      >
                        {key}
                      </span>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '11.5px',
                          color: '#cbd5e1'
                        }}
                        title={val}
                      >
                        {val}
                      </span>
                    </div>
                    <button
                      onClick={() => copyValue(key, val)}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        color: isCopied ? '#10b981' : '#888',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        flexShrink: 0
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.color = '#fff'
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)'
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.color = isCopied ? '#10b981' : '#888'
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                      }}
                    >
                      {isCopied ? <Check size={11} /> : <Copy size={11} />}
                      <span>{isCopied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )
              })}
            </div>
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
          <span>{envEntries.length} environment variables loaded in this process sandbox</span>
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
