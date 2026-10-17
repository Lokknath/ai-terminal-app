import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertCircle,
  Bot,
  Clock3,
  Coffee,
  ChevronDown,
  Columns2,
  Columns3,
  Grid2X2,
  LayoutGrid,
  Loader2,
  Maximize2,
  MessageSquare,
  NotebookPen,
  PanelLeft,
  PanelsTopLeft,
  Plus,
  Rows3,
  Search,
  Settings,
  Send,
  Sparkles,
  TerminalSquare,
  WandSparkles,
  type LucideIcon
} from 'lucide-react'
import { useApp, type AppMode } from '../store/AppContext'

export type LayoutPresetType =
  | 'solo'
  | 'pair'
  | 'swarm'
  | 'code-chat'
  | 'code-2-chat-1'
  | 'code-1-chat-2'
  | 'quad-code-chat'
  | 'tri-code-brave-chat'
  | 'master-3'
  | 'combo-2-3'
  | 'workbench'
  | 'stack'
  | 'sidebar'
  | 'tidy'

interface HeaderBarProps {
  onApplyLayout: (type: LayoutPresetType) => void
  onHoverLayout?: (type: LayoutPresetType | null) => void
  onNewTerminal: () => void
  onToggleFocusSplit: () => void
  onOpenNewModal: () => void
}

const modes: { mode: AppMode; label: string; shortcut: string; icon: LucideIcon }[] = [
  { mode: 'code', label: 'Code', shortcut: '⌘1', icon: TerminalSquare },
  { mode: 'agent', label: 'Agent', shortcut: '⌘2', icon: Bot },
  { mode: 'chat', label: 'Chat', shortcut: '⌘3', icon: MessageSquare },
  { mode: 'api', label: 'API', shortcut: '⌘4', icon: Send },
  { mode: 'notes', label: 'Notes', shortcut: '⌘5', icon: NotebookPen },
  { mode: 'usage', label: 'Usage', shortcut: '⌘6', icon: Activity }
]

const layouts: { type: LayoutPresetType; label: string; detail: string; icon: LucideIcon }[] = [
  { type: 'tidy', label: 'Tidy', detail: 'Balance open panes', icon: WandSparkles },
  { type: 'solo', label: 'Solo', detail: 'One full-width pane', icon: Maximize2 },
  { type: 'pair', label: 'Side by side', detail: 'Two equal columns', icon: Columns2 },
  { type: 'swarm', label: 'Three columns', detail: 'Three equal columns', icon: Columns3 },
  { type: 'code-chat', label: 'Code + web', detail: 'Terminal beside a browser', icon: Sparkles },
  {
    type: 'code-2-chat-1',
    label: 'Two code + web',
    detail: 'Stacked terminals beside web',
    icon: PanelsTopLeft
  },
  {
    type: 'code-1-chat-2',
    label: 'Code + two web',
    detail: 'Terminal beside two web panes',
    icon: PanelsTopLeft
  },
  {
    type: 'quad-code-chat',
    label: 'Four pane mix',
    detail: 'Two terminals and two web panes',
    icon: Grid2X2
  },
  {
    type: 'tri-code-brave-chat',
    label: 'Research trio',
    detail: 'Code, browser, and AI chat',
    icon: Columns3
  },
  {
    type: 'master-3',
    label: 'Master + three',
    detail: 'Large pane above three',
    icon: PanelsTopLeft
  },
  { type: 'combo-2-3', label: 'Two + three', detail: 'Two rows of panes', icon: LayoutGrid },
  { type: 'workbench', label: 'Workbench', detail: 'Two by two grid', icon: Grid2X2 },
  { type: 'stack', label: 'Stack', detail: 'Full-width rows', icon: Rows3 },
  {
    type: 'sidebar',
    label: 'Side focus',
    detail: 'Narrow pane beside a stack',
    icon: PanelsTopLeft
  }
]

export default function HeaderBar({
  onApplyLayout,
  onHoverLayout,
  onNewTerminal,
  onToggleFocusSplit,
  onOpenNewModal
}: HeaderBarProps): JSX.Element {
  const { state, dispatch } = useApp()
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [clock, setClock] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const layoutButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const initial = setTimeout(() => setClock(Date.now()), 0)
    const timer = setInterval(() => setClock(Date.now()), 30_000)
    return () => {
      clearTimeout(initial)
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!layoutOpen) return
    const closeOutside = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setLayoutOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setLayoutOpen(false)
        layoutButtonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [layoutOpen])

  const showGrid = (): void => {
    dispatch({ type: 'SET_VIEW_MODE', viewMode: 'grid' })
    dispatch({ type: 'SET_ACTIVE_SESSION', id: null })
  }

  const showFull = (): void => {
    const id = state.activeSessionId || state.terminals[0]?.id
    if (id) dispatch({ type: 'SET_ACTIVE_SESSION', id })
  }

  const workingCount = state.terminals.filter((t) => t.agentState?.status === 'working').length
  const waitingTerminals = state.terminals.filter((t) => t.agentState?.status === 'waiting')
  const waitingCount = waitingTerminals.length

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

  return (
    <header className="app-header">
      <div className="header-brand">
        <button
          type="button"
          className="icon-button sidebar-toggle"
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          aria-label={state.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          title={state.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          <PanelLeft size={17} />
        </button>
        <div className="brand-symbol" aria-hidden="true">
          <TerminalSquare size={19} />
        </div>
        <div className="brand-name">
          <strong>Nexus</strong>
          <span
            className="brand-ist"
            title={
              clock
                ? new Intl.DateTimeFormat('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    dateStyle: 'full',
                    timeStyle: 'short'
                  }).format(clock)
                : 'India Standard Time'
            }
          >
            <Clock3 size={10} />{' '}
            {clock
              ? new Intl.DateTimeFormat('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                }).format(clock)
              : '—'}{' '}
            IST
          </span>
        </div>
      </div>

      <div className="header-center-controls">
        <button
          type="button"
          className="header-search-trigger"
          onClick={() => dispatch({ type: 'SET_SHOW_PALETTE', show: true })}
          title="Search commands, sessions, tools (⌘K)"
        >
          <Search size={13} className="search-icon" />
          <span className="search-text">Search commands, sessions, tools...</span>
          <kbd className="search-kbd">⌘K</kbd>
        </button>

        <nav className="header-modes" aria-label="Workspace mode">
          {modes.map(({ mode, label, shortcut, icon: Icon }) => (
            <button
              type="button"
              key={mode}
              className={state.mode === mode ? 'mode-button is-active' : 'mode-button'}
              data-mode={mode}
              aria-current={state.mode === mode ? 'page' : undefined}
              onClick={() => dispatch({ type: 'SET_MODE', mode })}
              title={`${label} Workspace (${shortcut})`}
            >
              <Icon size={14} />
              <span>{label}</span>
              <span className="mode-shortcut-hint">{shortcut}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="header-actions">
        {/* Herdr Swarm Status Indicator */}
        {waitingCount > 0 ? (
          <button
            type="button"
            className="header-control swarm-status-badge is-waiting"
            onClick={handleJumpToWaiting}
            title={
              waitingCount > 1
                ? `${waitingCount} agents waiting for approval/input. Click to cycle through.`
                : '1 agent waiting for approval/input. Click to jump.'
            }
            style={{
              borderColor: 'rgba(245, 158, 11, 0.6)',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              color: '#f59e0b',
              fontWeight: 600,
              fontSize: '12px',
              gap: '6px'
            }}
          >
            <AlertCircle size={14} className="animate-pulse" />
            <span>{waitingCount} Blocked</span>
          </button>
        ) : workingCount > 0 ? (
          <div
            className="header-control swarm-status-badge is-working"
            title={`${workingCount} agent(s) actively working`}
            style={{
              borderColor: 'rgba(16, 185, 129, 0.4)',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981',
              fontWeight: 500,
              fontSize: '12px',
              gap: '6px'
            }}
          >
            <Loader2 size={13} className="animate-spin" />
            <span>{workingCount} Active</span>
          </div>
        ) : null}

        {/* Herdr Run-when-Away Keep-Awake Toggle */}
        <button
          type="button"
          className={`icon-button keep-awake-btn ${state.keepAwake ? 'is-active' : ''}`}
          onClick={handleToggleKeepAwake}
          title={
            state.keepAwake
              ? 'Keep-Awake Active: System sleep and timer suspension prevented while agents run'
              : 'Enable Keep-Awake: Prevent OS sleep during long-running agent workflows'
          }
          aria-label="Toggle keep awake"
          style={{
            position: 'relative',
            color: state.keepAwake ? '#f59e0b' : 'inherit',
            borderColor: state.keepAwake ? 'rgba(245, 158, 11, 0.5)' : undefined,
            backgroundColor: state.keepAwake ? 'rgba(245, 158, 11, 0.12)' : undefined
          }}
        >
          <Coffee size={16} />
          {state.keepAwake && (
            <span
              style={{
                position: 'absolute',
                top: '5px',
                right: '5px',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 6px #10b981'
              }}
            />
          )}
        </button>
        {state.mode === 'code' && (
          <>
            <div className="layout-control" ref={menuRef}>
              <button
                type="button"
                ref={layoutButtonRef}
                className="header-control layout-trigger"
                aria-expanded={layoutOpen}
                aria-controls="layout-options"
                onClick={() => setLayoutOpen((open) => !open)}
              >
                <LayoutGrid size={15} />
                <span>Layout</span>
                <ChevronDown size={13} />
              </button>
              {layoutOpen && (
                <div
                  className="layout-menu"
                  id="layout-options"
                  role="group"
                  aria-label="Choose pane layout"
                >
                  <div className="menu-heading">Arrange workspace</div>
                  {layouts.map(({ type, label, detail, icon: Icon }) => (
                    <button
                      type="button"
                      key={type}
                      className="layout-option"
                      onMouseEnter={() => onHoverLayout?.(type)}
                      onMouseLeave={() => onHoverLayout?.(null)}
                      onFocus={() => onHoverLayout?.(type)}
                      onBlur={() => onHoverLayout?.(null)}
                      onClick={() => {
                        onApplyLayout(type)
                        onHoverLayout?.(null)
                        setLayoutOpen(false)
                        layoutButtonRef.current?.focus()
                      }}
                    >
                      <Icon size={16} />
                      <span>
                        <strong>{label}</strong>
                        <small>{detail}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="view-switch" aria-label="Workspace view">
              <button
                type="button"
                className={state.viewMode === 'grid' ? 'is-active' : ''}
                onClick={showGrid}
                title="Grid view"
              >
                <Grid2X2 size={12} />
                <span>Grid</span>
              </button>
              <button
                type="button"
                className={state.viewMode === 'split' ? 'is-active' : ''}
                onClick={onToggleFocusSplit}
                title="Focus and tile view"
              >
                <Sparkles size={12} />
                <span>Focus</span>
              </button>
              <button
                type="button"
                className={state.viewMode === 'full' ? 'is-active' : ''}
                onClick={showFull}
                title="Full session view"
              >
                <Maximize2 size={12} />
                <span>Full</span>
              </button>
            </div>
            <button
              type="button"
              className="header-control quick-terminal"
              onClick={onNewTerminal}
              title="New terminal"
            >
              <TerminalSquare size={15} />
              <span>Terminal</span>
            </button>
          </>
        )}
        <button type="button" className="header-primary" onClick={onOpenNewModal}>
          <Plus size={16} />
          <span>New</span>
        </button>
        <button
          type="button"
          className="icon-button settings-trigger"
          aria-label="Open settings"
          title="Settings"
          onClick={() => dispatch({ type: 'SET_SHOW_SETTINGS', show: true })}
        >
          <Settings size={17} />
        </button>
      </div>
    </header>
  )
}
