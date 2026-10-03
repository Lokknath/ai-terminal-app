import { useState } from 'react'
import { Folder, Monitor, FileText, Download, User, Bot, Sparkles, X, TerminalSquare } from 'lucide-react'

interface CommandPaletteProps {
  onSelect: (cwd: string, agent: string) => void;
  onClose: () => void;
}

export default function CommandPalette({ onSelect, onClose }: CommandPaletteProps): JSX.Element {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedCwd, setSelectedCwd] = useState<string>('')

  const folders = [
    { name: 'Home Directory', path: '~', icon: <User size={18} /> },
    { name: 'Desktop', path: '~/Desktop', icon: <Monitor size={18} /> },
    { name: 'Documents', path: '~/Documents', icon: <FileText size={18} /> },
    { name: 'Downloads', path: '~/Downloads', icon: <Download size={18} /> },
    { name: 'Root System', path: '/', icon: <Folder size={18} /> }
  ]

  const agents = [
    { name: 'Local Shell', id: 'local', icon: <TerminalSquare size={18} /> },
    { name: 'Antigravity AI', id: 'antigravity', icon: <Sparkles size={18} color="#00e5ff" /> },
    { name: 'Claude 3.5', id: 'claude', icon: <Bot size={18} color="#ff8a65" /> },
    { name: 'ChatGPT-4o', id: 'chatgpt', icon: <Bot size={18} color="#4caf50" /> }
  ]

  const handleFolderSelect = (path: string) => {
    setSelectedCwd(path)
    setStep(2)
  }

  const handleAgentSelect = (agentId: string) => {
    onSelect(selectedCwd, agentId)
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 9999
    }}>
      <div style={{
        width: '500px',
        backgroundColor: '#18181c',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        animation: 'popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between' }}>
          <h4 style={{ color: 'white', margin: 0, fontFamily: 'system-ui', fontWeight: 500 }}>
            {step === 1 ? 'Select Working Directory' : 'Assign AI Provider'}
          </h4>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}><X size={18}/></button>
        </div>

        {/* Content */}
        <div style={{ padding: '12px' }}>
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {folders.map(f => (
                <button
                  key={f.path}
                  onClick={() => handleFolderSelect(f.path)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                    backgroundColor: 'transparent', color: '#ccc', border: 'none', borderRadius: '8px',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s'
                  }}
                  onMouseOver={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff' }}
                  onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#ccc' }}
                >
                  {f.icon}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>{f.name}</span>
                    <span style={{ fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>{f.path}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {agents.map(a => (
                <button
                  key={a.id}
                  onClick={() => handleAgentSelect(a.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '16px',
                    backgroundColor: 'rgba(255,255,255,0.02)', color: '#eee', border: '1px solid rgba(255,255,255,0.05)', 
                    borderRadius: '8px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s'
                  }}
                  onMouseOver={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
                  onMouseOut={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)' }}
                >
                  {a.icon}
                  <span style={{ fontSize: '15px', fontWeight: 500 }}>{a.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
