import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'

interface TerminalPaneProps {
  id: string;
  name: string;
  cwd?: string;
  agent?: string;
  onClose: () => void;
}

export default function TerminalPane({ id, name, cwd = '~', agent = 'local', onClose }: TerminalPaneProps): JSX.Element {
  const terminalRef = useRef<HTMLDivElement>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const termInstanceRef = useRef<Terminal | null>(null)
  
  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: { background: '#1e1e1e' }
    })
    termInstanceRef.current = term

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    term.loadAddon(fitAddon)
    
    term.open(terminalRef.current)
    
    // We need a slight delay for react-grid-layout to finish its animation before fitting
    setTimeout(() => {
      fitAddon.fit()
      window.electron.ipcRenderer.send('pty-create', id, name, cwd)
    }, 100)

    term.onData((data) => {
      window.electron.ipcRenderer.send('pty-write', id, data)
    })

    window.electron.ipcRenderer.on(`pty-out-${id}`, (_, data) => {
      term.write(data)
    })

    const handleResize = () => {
      fitAddon.fit()
      window.electron.ipcRenderer.send('pty-resize', id, term.cols, term.rows)
    }

    window.addEventListener('resize', handleResize)
    
    // Setup resize observer on the container to detect grid layout changes
    const observer = new ResizeObserver(() => {
      handleResize()
    })
    observer.observe(terminalRef.current)

    return () => {
      window.electron.ipcRenderer.send('pty-kill', id)
      window.electron.ipcRenderer.removeAllListeners(`pty-out-${id}`)
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
      term.dispose()
    }
  }, [id, name])

  const restartTerminal = () => {
    if (termInstanceRef.current) {
      termInstanceRef.current.clear()
      termInstanceRef.current.write('\x1b[33mRestarting terminal...\x1b[0m\r\n')
    }
    window.electron.ipcRenderer.send('pty-restart', id, name, '')
  }

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#0f0f11' }}>
      <div className="drag-handle" style={{ 
        backgroundColor: 'rgba(255,255,255,0.03)', 
        color: 'white', 
        padding: '8px 12px', 
        fontSize: '13px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        cursor: 'grab',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        fontFamily: 'system-ui'
      }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00e5ff', boxShadow: '0 0 8px rgba(0,229,255,0.5)' }} />
          <span style={{ fontWeight: 500, letterSpacing: '0.5px' }}>{name}</span>
          <button 
            onClick={restartTerminal}
            title="Refresh Terminal"
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#888', cursor: 'pointer', borderRadius: '4px', fontSize: '11px', padding: '2px 6px', transition: 'all 0.2s' }}
            onMouseOver={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)' }}
            onMouseOut={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
          >
            ↻
          </button>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select 
            value={agent}
            readOnly
            style={{ 
              backgroundColor: 'rgba(0,0,0,0.3)', 
              color: '#aaa', 
              border: '1px solid rgba(255,255,255,0.1)', 
              borderRadius: '6px', 
              padding: '4px 8px',
              fontSize: '11px',
              outline: 'none',
              cursor: 'default'
            }}
          >
            <option value="local">Local Shell</option>
            <option value="chatgpt">🤖 ChatGPT</option>
            <option value="claude">🧠 Claude</option>
            <option value="antigravity">🚀 Antigravity AI</option>
          </select>
          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#ff5f56', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', marginLeft: '5px', opacity: 0.7 }}
            onMouseOver={e => e.currentTarget.style.opacity = '1'}
            onMouseOut={e => e.currentTarget.style.opacity = '0.7'}
            title="Close Terminal"
          >
            ✕
          </button>
        </div>
      </div>
      <div ref={terminalRef} style={{ flexGrow: 1, overflow: 'hidden', padding: '10px' }} />
    </div>
  )
}
