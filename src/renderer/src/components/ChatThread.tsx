import { useState, useRef, useEffect } from 'react'
import { useApp } from '../store/AppContext'
import { X, Send, StickyNote } from 'lucide-react'

interface ChatThreadProps {
  agentId: string
}

export default function ChatThread({ agentId }: ChatThreadProps): JSX.Element {
  const { state, dispatch } = useApp()
  const agent = state.agents.find((a) => a.id === agentId)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agent?.messages])

  const sendNote = (): void => {
    if (!input.trim() || !agent) return
    const userMsg = { role: 'user' as const, content: input, timestamp: new Date().getTime() }
    dispatch({ type: 'APPEND_MESSAGE', agentId, message: userMsg })
    setInput('')
  }

  if (!agent) return <div style={{ color: '#a3afbd', padding: '20px' }}>Session not found</div>

  return (
    <div
      style={{
        width: '360px',
        minWidth: '360px',
        backgroundColor: 'rgba(18, 18, 22, 0.95)',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <StickyNote size={15} color="#8baeff" />
          <span style={{ color: '#fff', fontWeight: 600, fontSize: '13px' }}>
            {agent.name} Notes
          </span>
        </div>
        <button
          onClick={() => dispatch({ type: 'CLOSE_THREAD' })}
          style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages / Notes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {agent.messages.length === 0 && (
          <div
            style={{ color: '#555', textAlign: 'center', padding: '40px 16px', fontSize: '13px' }}
          >
            No notes recorded yet.
            <br />
            Type below to add session notes or task items.
          </div>
        )}

        {agent.messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: '12px' }}>
            <div
              style={{
                fontSize: '13px',
                color: '#ddd',
                lineHeight: 1.5,
                backgroundColor: 'rgba(255,255,255,0.03)',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.06)'
              }}
            >
              {msg.content}
            </div>
            <div style={{ fontSize: '10px', color: '#555', marginTop: '4px', textAlign: 'right' }}>
              {new Date(msg.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          gap: '8px'
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendNote()
          }}
          placeholder="Add a note or task..."
          style={{
            flex: 1,
            padding: '8px 12px',
            backgroundColor: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '12px',
            outline: 'none'
          }}
        />
        <button
          onClick={sendNote}
          disabled={!input.trim()}
          style={{
            padding: '8px 12px',
            background: input.trim() ? '#5579db' : 'rgba(255,255,255,0.05)',
            border: 'none',
            borderRadius: '6px',
            color: input.trim() ? '#fff' : '#555',
            cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
