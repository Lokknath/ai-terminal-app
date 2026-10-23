import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertCircle,
  Bot,
  Clock3,
  ChevronDown,
  Columns2,
  Columns3,
  FolderOpen,
  Globe,
  Grid2X2,
  LayoutGrid,
  Loader2,
  Maximize2,
  MessageSquare,
  NotebookPen,
  PanelLeft,
  PanelsTopLeft,
  Plus,
  RotateCcw,
  Rows3,
  Search,
  Settings,
  Send,
  Sparkles,
  TerminalSquare,
  Timer,
  WandSparkles,
  type LucideIcon
} from 'lucide-react'
import { useApp, type AppMode } from '../store/AppContext'
import { AIAccount } from '../types'
import { SubscriptionBadge } from './SubscriptionBadge'

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
  visiblePaneCount?: number
  onApplyLayout: (type: LayoutPresetType) => void
  onHoverLayout?: (type: LayoutPresetType | null) => void
  onNewTerminal: () => void
  onOpenTerminalWithAccount?: (account: AIAccount, cwd?: string) => void
  onOpenFolderPickerForAccount?: (account: AIAccount) => void
  onOpenFolderPicker?: () => void
  onOpenWebChat?: (url: string, title: string) => void
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

const STOPWATCH_STORAGE_KEY = 'nexus_stopwatch_state'

interface StopwatchStorageData {
  running: boolean
  accumulatedMs: number
  startTime: number | null
}

function formatStopwatch(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function HeaderBar({
  visiblePaneCount,
  onApplyLayout,
  onHoverLayout,
  onNewTerminal,
  onOpenTerminalWithAccount,
  onOpenFolderPickerForAccount,
  onOpenFolderPicker,
  onOpenWebChat,
  onToggleFocusSplit,
  onOpenNewModal
}: HeaderBarProps): JSX.Element {
  const { state, dispatch } = useApp()
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [newMenuOpen, setNewMenuOpen] = useState(false)
  const [clock, setClock] = useState(0)
  const [stopwatchRunning, setStopwatchRunning] = useState(false)
  const [stopwatchElapsedSec, setStopwatchElapsedSec] = useState(0)
  const stopwatchRef = useRef<StopwatchStorageData>({
    running: false,
    accumulatedMs: 0,
    startTime: null
  })
  const menuRef = useRef<HTMLDivElement>(null)
  const layoutButtonRef = useRef<HTMLButtonElement>(null)
  const newMenuRef = useRef<HTMLDivElement>(null)
  const newButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let saved: StopwatchStorageData | null = null
    try {
      const raw = localStorage.getItem(STOPWATCH_STORAGE_KEY)
      if (raw) saved = JSON.parse(raw)
    } catch {
      // ignore
    }

    if (saved && typeof saved.accumulatedMs === 'number') {
      stopwatchRef.current = saved
      if (saved.running && saved.startTime) {
        const currentElapsed = saved.accumulatedMs + (Date.now() - saved.startTime)
        setStopwatchElapsedSec(Math.floor(currentElapsed / 1000))
        setStopwatchRunning(true)
      } else {
        setStopwatchElapsedSec(Math.floor(saved.accumulatedMs / 1000))
        setStopwatchRunning(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!stopwatchRunning) return

    const tick = (): void => {
      const current = stopwatchRef.current
      if (!current.running || !current.startTime) return
      const totalMs = current.accumulatedMs + (Date.now() - current.startTime)
      setStopwatchElapsedSec(Math.floor(totalMs / 1000))
    }

    tick()
    const interval = setInterval(tick, 250)
    return () => clearInterval(interval)
  }, [stopwatchRunning])

  const handleStopwatchToggle = (): void => {
    const now = Date.now()
    const current = stopwatchRef.current

    if (current.running) {
      const newAccum = current.accumulatedMs + (current.startTime ? now - current.startTime : 0)
      const nextState: StopwatchStorageData = {
        running: false,
        accumulatedMs: newAccum,
        startTime: null
      }
      stopwatchRef.current = nextState
      setStopwatchRunning(false)
      setStopwatchElapsedSec(Math.floor(newAccum / 1000))
      try {
        localStorage.setItem(STOPWATCH_STORAGE_KEY, JSON.stringify(nextState))
      } catch {
        // ignore
      }
    } else {
      const nextState: StopwatchStorageData = {
        running: true,
        accumulatedMs: current.accumulatedMs,
        startTime: now
      }
      stopwatchRef.current = nextState
      setStopwatchRunning(true)
      try {
        localStorage.setItem(STOPWATCH_STORAGE_KEY, JSON.stringify(nextState))
      } catch {
        // ignore
      }
    }
  }

  const handleStopwatchReset = (): void => {
    const nextState: StopwatchStorageData = {
      running: false,
      accumulatedMs: 0,
      startTime: null
    }
    stopwatchRef.current = nextState
    setStopwatchRunning(false)
    setStopwatchElapsedSec(0)
    try {
      localStorage.setItem(STOPWATCH_STORAGE_KEY, JSON.stringify(nextState))
    } catch {
      // ignore
    }
  }

  const stopwatchTooltip = useMemo(() => {
    const formatted = formatStopwatch(stopwatchElapsedSec)
    if (stopwatchRunning) {
      return `Stopwatch: ${formatted} (Running — Click to pause, right-click to reset)`
    }
    if (stopwatchElapsedSec > 0) {
      return `Stopwatch: ${formatted} (Paused — Click to resume, right-click to reset)`
    }
    return 'Developer Stopwatch (Click to start)'
  }, [stopwatchRunning, stopwatchElapsedSec])

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

  useEffect(() => {
    if (!newMenuOpen) return
    const closeOutside = (event: MouseEvent): void => {
      if (!newMenuRef.current?.contains(event.target as Node)) setNewMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setNewMenuOpen(false)
        newButtonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [newMenuOpen])

  const showGrid = (): void => {
    dispatch({ type: 'SET_VIEW_MODE', viewMode: 'grid' })
  }

  const showFull = (): void => {
    const id = state.activeSessionId || state.terminals[0]?.id
    if (id) {
      dispatch({ type: 'SET_ACTIVE_SESSION', id })
      dispatch({ type: 'SET_VIEW_MODE', viewMode: 'full' })
    }
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

  // Dynamic recommendations based on currently visible pane count
  const recommendedLayouts = useMemo(() => {
    const count = visiblePaneCount ?? 2
    if (count <= 1) {
      return [
        { type: 'solo' as LayoutPresetType, label: 'Solo (Full Width)', detail: 'Full-width single pane', icon: Maximize2 }
      ]
    }
    if (count === 2) {
      return [
        { type: 'pair' as LayoutPresetType, label: 'Side by Side (Left / Right)', detail: 'Two equal 50/50 columns', icon: Columns2 },
        { type: 'stack' as LayoutPresetType, label: 'Stacked (Up / Down)', detail: 'Two equal 50/50 rows', icon: Rows3 },
        { type: 'solo' as LayoutPresetType, label: 'Solo Focus', detail: 'Full-width active pane', icon: Maximize2 }
      ]
    }
    if (count === 3) {
      return [
        { type: 'swarm' as LayoutPresetType, label: 'Three Equal Columns', detail: 'Three equal columns side-by-side', icon: Columns3 },
        { type: 'sidebar' as LayoutPresetType, label: 'Master Left + Two Stacked', detail: 'Main pane + 2 side tools', icon: PanelsTopLeft },
        { type: 'stack' as LayoutPresetType, label: 'Three Stacked Rows', detail: 'Three equal horizontal rows', icon: Rows3 }
      ]
    }
    if (count === 4) {
      return [
        { type: 'workbench' as LayoutPresetType, label: '2x2 Grid (Quadrants)', detail: 'Four equal quadrant panes', icon: Grid2X2 },
        { type: 'tidy' as LayoutPresetType, label: 'Four Columns', detail: 'Four balanced columns', icon: WandSparkles }
      ]
    }
    return [
      { type: 'tidy' as LayoutPresetType, label: 'Auto Balanced', detail: `Optimized layout for ${count} panes`, icon: WandSparkles },
      { type: 'swarm' as LayoutPresetType, label: 'Columns', detail: 'Equal columns', icon: Columns3 },
      { type: 'workbench' as LayoutPresetType, label: 'Grid', detail: 'Balanced grid', icon: Grid2X2 }
    ]
  }, [visiblePaneCount])

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
          <div className="brand-meta-row">
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
            <span className="brand-divider" aria-hidden="true">•</span>
            <div
              className={`header-stopwatch ${stopwatchRunning ? 'is-running' : ''} ${stopwatchElapsedSec > 0 && !stopwatchRunning ? 'is-paused' : ''}`}
              role="button"
              tabIndex={0}
              onClick={handleStopwatchToggle}
              onDoubleClick={handleStopwatchReset}
              onContextMenu={(e) => {
                e.preventDefault()
                handleStopwatchReset()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleStopwatchToggle()
                } else if (e.key === 'Escape' || e.key === 'Backspace') {
                  e.preventDefault()
                  handleStopwatchReset()
                }
              }}
              title={stopwatchTooltip}
              aria-label={stopwatchTooltip}
            >
              <Timer size={10} className={`stopwatch-icon ${stopwatchRunning ? 'is-pulsing' : ''}`} />
              <span className="stopwatch-digits">{formatStopwatch(stopwatchElapsedSec)}</span>
              {stopwatchElapsedSec > 0 && (
                <button
                  type="button"
                  className="stopwatch-reset-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleStopwatchReset()
                  }}
                  title="Reset stopwatch (00:00)"
                  aria-label="Reset stopwatch"
                >
                  <RotateCcw size={9} />
                </button>
              )}
            </div>
          </div>
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
          <span className="search-text">Search...</span>
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
            </button>
          ))}
        </nav>
      </div>

      <div className="header-actions">
        {state.mode === 'code' && (
          <>
            <div className="layout-control" ref={menuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                ref={layoutButtonRef}
                className="header-control layout-trigger"
                aria-expanded={layoutOpen}
                aria-controls="layout-options"
                onClick={() => setLayoutOpen((open) => !open)}
                title="Arrange terminal panes and layout"
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
                  style={{
                    minWidth: '270px',
                    position: 'absolute',
                    right: 0,
                    top: 'calc(100% + 6px)',
                    maxHeight: 'calc(100vh - 70px)',
                    overflowY: 'auto',
                    zIndex: 300
                  }}
                >
                  <div className="menu-heading" style={{ color: '#8baeff' }}>
                    Recommended ({visiblePaneCount ?? 2} Panes)
                  </div>
                  {recommendedLayouts.map(({ type, label, detail, icon: Icon }) => (
                    <button
                      type="button"
                      key={`rec-${type}`}
                      className="layout-option"
                      style={{
                        backgroundColor: 'rgba(117, 157, 255, 0.08)',
                        border: '1px solid rgba(117, 157, 255, 0.22)',
                        marginBottom: '4px'
                      }}
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
                      <Icon size={16} color="#8baeff" />
                      <span>
                        <strong style={{ color: '#8baeff' }}>{label}</strong>
                        <small>{detail}</small>
                      </span>
                    </button>
                  ))}

                  <div className="menu-heading" style={{ marginTop: '8px' }}>
                    All Layout Presets
                  </div>
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
                title="Grid View (⌘⇧G)"
                aria-label="Grid view"
              >
                <Grid2X2 size={13} />
              </button>
              <button
                type="button"
                className={state.viewMode === 'split' ? 'is-active' : ''}
                onClick={onToggleFocusSplit}
                title="Focus View (Toggle 50/50 Focus)"
                aria-label="Focus view"
              >
                <Sparkles size={13} />
              </button>
              <button
                type="button"
                className={state.viewMode === 'full' ? 'is-active' : ''}
                onClick={showFull}
                title="Full View (Single Pane)"
                aria-label="Full session view"
              >
                <Maximize2 size={13} />
              </button>
            </div>
          </>
        )}

        {/* Swarm Status Indicator */}
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

        {/* Enhanced "+ New" Dropdown */}
        <div
          className="new-control-container"
          ref={newMenuRef}
          style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
        >
          <button
            type="button"
            className="header-primary"
            onClick={onOpenNewModal}
            title="Create new panel or session (All options dialog)"
            style={{
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
              paddingRight: '8px'
            }}
          >
            <Plus size={15} />
            <span>New</span>
          </button>
          <button
            type="button"
            ref={newButtonRef}
            className="header-primary"
            aria-expanded={newMenuOpen}
            onClick={() => setNewMenuOpen((open) => !open)}
            title="Quick launch templates and AI accounts"
            style={{
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
              borderLeft: '1px solid rgba(255,255,255,0.2)',
              padding: '0 6px',
              minWidth: '24px'
            }}
          >
            <ChevronDown size={13} style={{ opacity: 0.9 }} />
          </button>
          {newMenuOpen && (
            <div
              className="layout-menu new-dropdown-menu"
              role="menu"
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 6px)',
                width: '300px',
                maxHeight: 'calc(100vh - 70px)',
                overflowY: 'auto',
                zIndex: 350
              }}
            >
              <div className="menu-heading">Quick Launch</div>
              <button
                type="button"
                className="layout-option"
                onClick={() => {
                  onNewTerminal()
                  setNewMenuOpen(false)
                }}
              >
                <TerminalSquare size={16} color="#8baeff" />
                <span>
                  <strong>Default Terminal</strong>
                  <small>System shell in home directory (~)</small>
                </span>
              </button>

              {onOpenFolderPicker && (
                <button
                  type="button"
                  className="layout-option"
                  onClick={() => {
                    onOpenFolderPicker()
                    setNewMenuOpen(false)
                  }}
                >
                  <FolderOpen size={16} color="#e5c07b" />
                  <span>
                    <strong>Open Folder in Terminal...</strong>
                    <small>Choose custom workspace directory</small>
                  </span>
                </button>
              )}

              <button
                type="button"
                className="layout-option"
                onClick={() => {
                  setNewMenuOpen(false)
                  onOpenNewModal()
                }}
              >
                <Sparkles size={16} color="#759dff" />
                <span>
                  <strong>Launch Agent in Folder...</strong>
                  <small>Pick an AI agent and project directory</small>
                </span>
              </button>

              {state.aiAccounts.length > 0 && (
                <>
                  <div className="menu-heading" style={{ marginTop: '8px' }}>
                    AI Agent Terminals
                  </div>
                  {state.aiAccounts.map((acc) => {
                    const icon =
                      acc.providerId === 'gemini'
                        ? '💎'
                        : acc.providerId === 'claude'
                          ? '🧠'
                          : acc.providerId === 'chatgpt'
                            ? '🤖'
                            : '🦁'
                    const email = acc.googleEmail
                    return (
                      <div
                        key={acc.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '2px 0'
                        }}
                      >
                        <button
                          type="button"
                          className="layout-option"
                          style={{ flex: 1, minWidth: 0, margin: 0 }}
                          onClick={() => {
                            if (onOpenTerminalWithAccount) {
                              onOpenTerminalWithAccount(acc)
                            } else {
                              onNewTerminal()
                            }
                            setNewMenuOpen(false)
                          }}
                        >
                          <span style={{ fontSize: '15px' }}>{icon}</span>
                          <span style={{ overflow: 'hidden' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {acc.name}
                              </strong>
                              <SubscriptionBadge type={acc.usage?.tier} />
                            </span>
                            <small style={{ color: email ? '#4caf50' : '#8baeff' }}>
                              {email || `${acc.providerId.toUpperCase()} CLI`}
                            </small>
                          </span>
                        </button>
                        {onOpenFolderPickerForAccount && (
                          <button
                            type="button"
                            title={`Launch ${acc.name} in specific workspace folder`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setNewMenuOpen(false)
                              onOpenFolderPickerForAccount(acc)
                            }}
                            style={{
                              padding: '6px 8px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '6px',
                              color: '#e5c07b',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 500,
                              flexShrink: 0
                            }}
                            onMouseOver={(e) =>
                              (e.currentTarget.style.backgroundColor = 'rgba(229, 192, 123, 0.15)')
                            }
                            onMouseOut={(e) =>
                              (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)')
                            }
                          >
                            <FolderOpen size={12} />
                            <span>In Folder</span>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </>
              )}

              {onOpenWebChat && (
                <>
                  <div className="menu-heading" style={{ marginTop: '8px' }}>
                    Web AI Chat
                  </div>
                  <button
                    type="button"
                    className="layout-option"
                    onClick={() => {
                      onOpenWebChat('https://claude.ai', 'Claude.ai')
                      setNewMenuOpen(false)
                    }}
                  >
                    <Globe size={15} color="#d97706" />
                    <span>
                      <strong>Claude.ai Web</strong>
                      <small>claude.ai</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="layout-option"
                    onClick={() => {
                      onOpenWebChat('https://chatgpt.com', 'ChatGPT')
                      setNewMenuOpen(false)
                    }}
                  >
                    <Globe size={15} color="#10b981" />
                    <span>
                      <strong>ChatGPT Web</strong>
                      <small>chatgpt.com</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="layout-option"
                    onClick={() => {
                      onOpenWebChat('https://gemini.google.com', 'Gemini Web')
                      setNewMenuOpen(false)
                    }}
                  >
                    <Globe size={15} color="#3b82f6" />
                    <span>
                      <strong>Gemini Web</strong>
                      <small>gemini.google.com</small>
                    </span>
                  </button>
                </>
              )}

              <div
                style={{
                  height: '1px',
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  margin: '6px 0'
                }}
              />
              <button
                type="button"
                className="layout-option"
                onClick={() => {
                  onOpenNewModal()
                  setNewMenuOpen(false)
                }}
              >
                <Plus size={15} color="#94a3b8" />
                <span>
                  <strong>All Templates & Dialog...</strong>
                  <small>Open full panel creation dialog</small>
                </span>
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="icon-button settings-trigger"
          aria-label="Open settings"
          title="Settings"
          style={{ flexShrink: 0 }}
          onClick={() => dispatch({ type: 'SET_SHOW_SETTINGS', show: true })}
        >
          <Settings size={17} />
        </button>
      </div>
    </header>
  )
}
