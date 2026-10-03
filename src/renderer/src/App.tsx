import { useState } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout/legacy'
import TerminalPane from './components/TerminalPane'
import CommandPalette from './components/CommandPalette'
import { LayoutGrid, SplitSquareHorizontal, SplitSquareVertical, Columns2, Columns3, Plus, TerminalSquare } from 'lucide-react'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

export default function App(): JSX.Element {
  const [terminals, setTerminals] = useState([{ id: 'term-1', name: 'Main-1', cwd: '~', agent: 'local' }])
  const [layouts, setLayouts] = useState<{ lg: any[] }>({ lg: [] })
  const [showPalette, setShowPalette] = useState(false)

  const handlePaletteSelect = (cwd: string, agent: string) => {
    const newId = `term-${Date.now()}`
    setTerminals([...terminals, { id: newId, name: `Terminal-${terminals.length + 1}`, cwd, agent }])
    setShowPalette(false)
  }

  const removeTerminal = (idToRemove: string) => {
    setTerminals(terminals.filter(t => t.id !== idToRemove))
  }

  const applyLayout = (type: 'grid' | 'vertical' | 'horizontal' | 'sidebar-left' | 'triple') => {
    const newLayout = terminals.map((term, i) => {
      if (type === 'vertical') return { i: term.id, x: 0, y: i * 4, w: 12, h: 4, minW: 3, minH: 2 }
      if (type === 'horizontal') return { i: term.id, x: (i * (12/terminals.length)), y: 0, w: Math.floor(12/terminals.length) || 1, h: 8, minW: 3, minH: 2 }
      if (type === 'sidebar-left') return i === 0 
        ? { i: term.id, x: 0, y: 0, w: 3, h: 12, minW: 2, minH: 2 } 
        : { i: term.id, x: 3, y: (i - 1) * 4, w: 9, h: 4, minW: 3, minH: 2 }
      if (type === 'triple') return { i: term.id, x: (i % 3) * 4, y: Math.floor(i / 3) * 4, w: 4, h: 4, minW: 3, minH: 2 }
      // Default grid (2x2)
      return { i: term.id, x: (i % 2) * 6, y: Math.floor(i / 2) * 4, w: 6, h: 4, minW: 3, minH: 2 }
    })
    setLayouts({ lg: newLayout })
  }

  return (
    <div style={{ height: '100vh', width: '100vw', backgroundColor: '#0f0f11', backgroundImage: 'radial-gradient(circle at top right, #1a1a24, #0f0f11)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      
      {/* Glassmorphism Header */}
      <div style={{ 
        padding: '12px 20px', 
        backgroundColor: 'rgba(20, 20, 25, 0.7)', 
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <TerminalSquare size={24} color="#00e5ff" />
          <h3 style={{ color: '#fff', margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 600, letterSpacing: '0.5px' }}>
            Antigravity <span style={{ color: '#00e5ff', fontWeight: 400 }}>Terminal</span>
          </h3>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Layout Toolbelt */}
          <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <button title="2x2 Grid" onClick={() => applyLayout('grid')} style={{ padding: '6px', cursor: 'pointer', background: 'transparent', color: '#aaa', border: 'none', borderRadius: '4px', display: 'flex' }} onMouseOver={e => e.currentTarget.style.color = '#fff'} onMouseOut={e => e.currentTarget.style.color = '#aaa'}><LayoutGrid size={18} /></button>
            <button title="Split Horizontal" onClick={() => applyLayout('horizontal')} style={{ padding: '6px', cursor: 'pointer', background: 'transparent', color: '#aaa', border: 'none', borderRadius: '4px', display: 'flex' }} onMouseOver={e => e.currentTarget.style.color = '#fff'} onMouseOut={e => e.currentTarget.style.color = '#aaa'}><Columns2 size={18} /></button>
            <button title="Split Vertical" onClick={() => applyLayout('vertical')} style={{ padding: '6px', cursor: 'pointer', background: 'transparent', color: '#aaa', border: 'none', borderRadius: '4px', display: 'flex' }} onMouseOver={e => e.currentTarget.style.color = '#fff'} onMouseOut={e => e.currentTarget.style.color = '#aaa'}><SplitSquareHorizontal size={18} /></button>
            <button title="Sidebar Layout" onClick={() => applyLayout('sidebar-left')} style={{ padding: '6px', cursor: 'pointer', background: 'transparent', color: '#aaa', border: 'none', borderRadius: '4px', display: 'flex' }} onMouseOver={e => e.currentTarget.style.color = '#fff'} onMouseOut={e => e.currentTarget.style.color = '#aaa'}><SplitSquareVertical size={18} /></button>
            <button title="3 Columns" onClick={() => applyLayout('triple')} style={{ padding: '6px', cursor: 'pointer', background: 'transparent', color: '#aaa', border: 'none', borderRadius: '4px', display: 'flex' }} onMouseOver={e => e.currentTarget.style.color = '#fff'} onMouseOut={e => e.currentTarget.style.color = '#aaa'}><Columns3 size={18} /></button>
          </div>

          <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />

          <button 
            onClick={() => setShowPalette(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', cursor: 'pointer', background: 'linear-gradient(135deg, #007acc 0%, #005999 100%)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 500, boxShadow: '0 2px 10px rgba(0, 122, 204, 0.4)', transition: 'transform 0.1s' }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <Plus size={16} /> New Terminal
          </button>
        </div>
      </div>
      
      {showPalette && (
        <CommandPalette 
          onSelect={handlePaletteSelect} 
          onClose={() => setShowPalette(false)} 
        />
      )}

      <div style={{ flexGrow: 1, overflow: 'auto', padding: '10px' }}>
        <ResponsiveGridLayout
          className="layout"
          layouts={layouts}
          onLayoutChange={(layout) => setLayouts({ lg: layout })}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={100}
          draggableHandle=".drag-handle"
          margin={[15, 15]}
        >
          {terminals.map((term, i) => (
            <div 
              key={term.id} 
              data-grid={{ x: (i % 2) * 6, y: Math.floor(i / 2) * 4, w: 6, h: 4, minW: 3, minH: 2 }}
              style={{ 
                border: '1px solid rgba(255,255,255,0.08)', 
                backgroundColor: '#141416',
                borderRadius: '10px',
                overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
              }}
            >
              <div style={{ height: '100%', width: '100%' }}>
                <TerminalPane id={term.id} name={term.name} cwd={term.cwd} agent={term.agent} onClose={() => removeTerminal(term.id)} />
              </div>
            </div>
          ))}
        </ResponsiveGridLayout>
      </div>
    </div>
  )
}
