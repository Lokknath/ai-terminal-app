import { useState, useEffect, useRef } from 'react'
import { useApp } from '../store/AppContext'
import { getProvidersByTier } from '../store/providers'
import {
  X,
  Search,
  TerminalSquare,
  FolderOpen,
  LayoutGrid,
  Columns2,
  SplitSquareHorizontal,
  Columns3,
  Maximize2,
  PanelTop,
  PanelsTopBottom,
  Sparkles,
  Star,
  Bot,
  MessageSquare,
  NotebookPen,
  Send,
  Activity,
  PanelLeft,
  Settings,
  Radio,
  CheckCheck,
  XCircle,
  Coffee,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FileCode
} from 'lucide-react'
import { AIAccount, getAccountEnv, getProviderCliCommand } from '../types'
import { LayoutPresetType } from './HeaderBar'
import { useDialogFocus } from '../hooks/useDialogFocus'

function accountProfileLabel(account: AIAccount): string {
  const env = getAccountEnv(account)
  if (account.providerId === 'claude') return env.CLAUDE_CONFIG_DIR || '~/.claude'
  if (account.providerId === 'chatgpt') return env.CODEX_HOME || '~/.codex'
  if (account.providerId === 'gemini') return env.GEMINI_DIR || '~/.gemini'
  return 'default shell'
}

interface CommandPaletteProps {
  onNewTerminal: (
    cwd?: string,
    name?: string,
    command?: string,
    providerId?: string,
    accountId?: string,
    customEnv?: Record<string, string>
  ) => void
  onNewWebChat: (url: string, title: string, partition?: string) => void
  onLaunchCLI: (
    command: string,
    name: string,
    cwd?: string,
    accountId?: string,
    customEnv?: Record<string, string>
  ) => void
  onApplyLayout: (type: LayoutPresetType) => void
  onOpenFolderPicker: (title: string, onSelect: (path: string) => void) => void
}

export default function CommandPalette({
  onNewTerminal,
  onNewWebChat,
  onLaunchCLI,
  onApplyLayout,
  onOpenFolderPicker
}: CommandPaletteProps): JSX.Element {
  const { state, dispatch } = useApp()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<
    'all' | 'terminal' | 'cli' | 'web' | 'layout' | 'workspace' | 'swarm'
  >('all')
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus(dialogRef, () => dispatch({ type: 'SET_SHOW_PALETTE', show: false }))

  const byoaProviders = getProvidersByTier('byoa')

  useEffect(() => {
    inputRef.current?.focus()
    return undefined
  }, [dispatch])

  const close = (): void => dispatch({ type: 'SET_SHOW_PALETTE', show: false })

  const filterMatch = (text: string): boolean =>
    !search || text.toLowerCase().includes(search.toLowerCase())

  const renderItem = (
    icon: JSX.Element,
    label: string,
    sublabel: string,
    onClick: () => void,
    accent?: string,
    disabled = false
  ): JSX.Element | null => {
    if (!filterMatch(label) && !filterMatch(sublabel)) return null
    return (
      <button
        key={label}
        disabled={disabled}
        onClick={onClick}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 14px',
          backgroundColor: 'transparent',
          color: '#ccc',
          border: 'none',
          borderRadius: '8px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          textAlign: 'left',
          transition: 'all 0.1s'
        }}
        onMouseOver={(e) => {
          if (disabled) return
          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'
          e.currentTarget.style.color = '#fff'
        }}
        onMouseOut={(e) => {
          if (disabled) return
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = '#ccc'
        }}
      >
        <span style={{ color: accent || '#888', display: 'flex' }}>{icon}</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>{label}</span>
          <span style={{ fontSize: '12px', color: '#a3afbd' }}>{sublabel}</span>
        </div>
      </button>
    )
  }

  const renderSection = (title: string, children: (JSX.Element | null)[]): JSX.Element | null => {
    const filtered = children.filter(Boolean)
    if (filtered.length === 0) return null
    return (
      <div style={{ marginBottom: '12px' }} key={title}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#a3afbd',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            padding: '4px 14px 6px',
            marginTop: '4px'
          }}
        >
          {title}
        </div>
        {filtered}
      </div>
    )
  }

  const handleLaunchCLIWithFolder = (cmd: string, name: string): void => {
    close()
    onOpenFolderPicker(`Select Folder for ${name}`, (selectedFolder) => {
      onLaunchCLI(cmd, name, selectedFolder)
    })
  }

  const handleNewTerminalWithFolder = (): void => {
    close()
    onOpenFolderPicker('Select Directory for Terminal', (selectedFolder) => {
      onNewTerminal(selectedFolder)
    })
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '14vh',
        zIndex: 9999
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{
          width: '540px',
          maxHeight: '62vh',
          backgroundColor: '#18181c',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 25px 70px rgba(0,0,0,0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Search Header */}
        <div
          style={{
            padding: '14px 16px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Search size={16} color="#666" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type a command, tool, or account..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '14px',
                outline: 'none'
              }}
            />
            <button
              onClick={close}
              aria-label="Close command palette"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                display: 'flex'
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Category Filter Tabs */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
            {[
              { id: 'all' as const, label: 'All' },
              { id: 'swarm' as const, label: '🐝 Swarm & Agents' },
              { id: 'workspace' as const, label: '🚀 Workspaces' },
              { id: 'terminal' as const, label: '🖥 Terminals' },
              { id: 'cli' as const, label: '⚡ AI CLIs' },
              { id: 'web' as const, label: '🌐 Web Chats' },
              { id: 'layout' as const, label: '📐 Layouts' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCategoryFilter(tab.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '20px',
                  border:
                    categoryFilter === tab.id
                      ? '1px solid rgba(117, 157, 255, 0.4)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                  backgroundColor:
                    categoryFilter === tab.id
                      ? 'rgba(117, 157, 255, 0.15)'
                      : 'rgba(255, 255, 255, 0.03)',
                  color: categoryFilter === tab.id ? '#8baeff' : '#888',
                  fontSize: '12px',
                  fontWeight: categoryFilter === tab.id ? 600 : 400,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.1s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {/* Workspaces & Navigation Section */}
          {(categoryFilter === 'all' || categoryFilter === 'workspace') &&
            renderSection('🚀 Workspaces & Navigation', [
              renderItem(
                <Bot size={16} />,
                'Switch to Agent Workspace',
                'Autonomous multi-agent orchestration and status monitoring (⌘1)',
                () => {
                  dispatch({ type: 'SET_MODE', mode: 'agent' })
                  close()
                },
                '#8baeff'
              ),
              renderItem(
                <TerminalSquare size={16} />,
                'Switch to Code Workspace',
                'Multi-pane terminal grid with AI CLI integration (⌘2)',
                () => {
                  dispatch({ type: 'SET_MODE', mode: 'code' })
                  close()
                },
                '#4caf50'
              ),
              renderItem(
                <MessageSquare size={16} />,
                'Switch to Chat Workspace',
                'Direct conversational AI sessions with multi-profile auth (⌘3)',
                () => {
                  dispatch({ type: 'SET_MODE', mode: 'chat' })
                  close()
                },
                '#ffd54f'
              ),
              renderItem(
                <Activity size={16} />,
                'Switch to Quota & Usage Analytics',
                'Live token usage, ratelimits, and subscription tiers (⌘4)',
                () => {
                  dispatch({ type: 'SET_MODE', mode: 'usage' })
                  close()
                },
                '#ff8a65'
              ),
              renderItem(
                <NotebookPen size={16} />,
                'Switch to Scratchpad & Notes',
                'Fast markdown scratchpad and developer documentation (⌘5)',
                () => {
                  dispatch({ type: 'SET_MODE', mode: 'notes' })
                  close()
                },
                '#a78bfa'
              ),
              renderItem(
                <Send size={16} />,
                'Switch to API Studio',
                'Draft, test, and execute REST requests with headers and secrets (⌘6)',
                () => {
                  dispatch({ type: 'SET_MODE', mode: 'api' })
                  close()
                },
                '#38bdf8'
              ),
              renderItem(
                <FileCode size={16} />,
                'Import & Run cURL / Axios Request',
                'Paste any cURL command (EaseMyTrip, cookies, headers) to run or convert to Axios',
                () => {
                  dispatch({ type: 'SET_MODE', mode: 'api' })
                  close()
                },
                '#818cf8'
              ),
              renderItem(
                <PanelLeft size={16} />,
                state.sidebarOpen ? 'Collapse Left Sidebar' : 'Expand Left Sidebar',
                'Toggle navigation sidebar visibility (⌘B)',
                () => {
                  dispatch({ type: 'TOGGLE_SIDEBAR' })
                  close()
                },
                '#888'
              ),
              renderItem(
                <Settings size={16} />,
                'Open Application Settings',
                'Manage accounts, safely encrypted API secrets, and profiles (⌘,)',
                () => {
                  dispatch({ type: 'SET_SHOW_SETTINGS', show: true })
                  close()
                },
                '#888'
              )
            ])}

          {/* Swarm Orchestration Section */}
          {(categoryFilter === 'all' || categoryFilter === 'swarm') &&
            renderSection('🐝 Swarm Orchestration & Control', [
              renderItem(
                <CheckCheck size={16} />,
                'Approve All Blocked Agents (y)',
                `Instantly approve all ${state.terminals.filter((t) => t.agentState?.status === 'waiting').length} blocked agents awaiting confirmation`,
                () => {
                  const waiting = state.terminals.filter((t) => t.agentState?.status === 'waiting')
                  waiting.forEach((t) => {
                    dispatch({
                      type: 'UPDATE_TERMINAL_AGENT_STATE',
                      id: t.id,
                      agentState: {
                        status: 'working',
                        promptQuestion: undefined,
                        reason: 'Approved by user (bulk)',
                        lastActiveAt: Date.now()
                      }
                    })
                    window.electron.ipcRenderer.send('pty-write', t.id, 'y\r')
                  })
                  close()
                },
                '#10b981',
                state.terminals.filter((t) => t.agentState?.status === 'waiting').length === 0
              ),
              renderItem(
                <XCircle size={16} />,
                'Deny All Blocked Agents (n)',
                `Instantly deny / cancel prompts on all ${state.terminals.filter((t) => t.agentState?.status === 'waiting').length} waiting agents`,
                () => {
                  const waiting = state.terminals.filter((t) => t.agentState?.status === 'waiting')
                  waiting.forEach((t) => {
                    dispatch({
                      type: 'UPDATE_TERMINAL_AGENT_STATE',
                      id: t.id,
                      agentState: {
                        status: 'idle',
                        promptQuestion: undefined,
                        reason: 'Denied by user (bulk)',
                        lastActiveAt: Date.now()
                      }
                    })
                    window.electron.ipcRenderer.send('pty-write', t.id, 'n\r')
                  })
                  close()
                },
                '#ef4444',
                state.terminals.filter((t) => t.agentState?.status === 'waiting').length === 0
              ),
              renderItem(
                <Radio size={16} />,
                'Broadcast Command to Swarm...',
                'Send a command or input string to all active terminal sessions simultaneously',
                () => {
                  const cmd = window.prompt('Enter command to broadcast to all terminals:')
                  if (cmd !== null && cmd.trim()) {
                    window.api.broadcastTerminalInput(cmd + '\r')
                  }
                  close()
                },
                '#06b6d4',
                state.terminals.length === 0
              ),
              renderItem(
                <Radio size={16} />,
                'Stop All Agents (^C)',
                'Send Ctrl+C interrupt signal to all active terminals',
                () => {
                  window.api.broadcastTerminalInput('\x03')
                  close()
                },
                '#f43f5e',
                state.terminals.length === 0
              ),
              renderItem(
                <Coffee size={16} />,
                state.keepAwake
                  ? 'Disable Keep-Awake (Allow System Sleep)'
                  : 'Enable Keep-Awake (Run When Away)',
                'Prevent system sleep and timer throttling during long-running background tasks',
                () => {
                  const next = !state.keepAwake
                  window.api
                    .setKeepAwake(next)
                    .then((active) => {
                      dispatch({ type: 'SET_KEEP_AWAKE', enabled: active })
                    })
                    .catch(() => {
                      dispatch({ type: 'SET_KEEP_AWAKE', enabled: next })
                    })
                  close()
                },
                state.keepAwake ? '#10b981' : '#f59e0b'
              )
            ])}

          {/* CLI Tools Section */}
          {(categoryFilter === 'all' || categoryFilter === 'cli') &&
            renderSection(
              '⚡ AI Coding CLIs (BYOA)',
              byoaProviders.map((p) => {
                const detected = state.detectedCLIs.includes(p.id)
                return renderItem(
                  <TerminalSquare size={16} />,
                  `${detected ? '✅' : '❌'} Launch ${p.name}`,
                  detected
                    ? `Select folder and run ${p.cliCommand}`
                    : `${p.cliCommand} — not installed on PATH`,
                  () => {
                    if (detected && p.cliCommand) {
                      handleLaunchCLIWithFolder(p.cliCommand, p.name)
                    }
                  },
                  detected ? '#4caf50' : '#666',
                  !detected
                )
              })
            )}

          {/* AI Accounts Section */}
          {(categoryFilter === 'all' || categoryFilter === 'web') &&
            renderSection(
              '🌐 AI Web Chat Screens (+ Multi-Screen)',
              state.aiAccounts.map((acc: AIAccount) => {
                const icon =
                  acc.providerId === 'claude'
                    ? '🧠'
                    : acc.providerId === 'chatgpt'
                      ? '🤖'
                      : acc.name.toLowerCase().includes('brave')
                        ? '🦁'
                        : '💎'
                return renderItem(
                  <span style={{ fontSize: '16px' }}>{icon}</span>,
                  `Open ${acc.name} (+ New Screen)`,
                  `Persistent session cookies: ${acc.url}`,
                  () => {
                    const screenCount =
                      state.terminals.filter((t) => t.name.startsWith(acc.name)).length + 1
                    const title = screenCount > 1 ? `${acc.name} (Screen ${screenCount})` : acc.name
                    onNewWebChat(acc.url, title, acc.partition)
                    close()
                  },
                  '#ff8a65'
                )
              })
            )}

          {/* Account Terminals Section */}
          {(categoryFilter === 'all' || categoryFilter === 'terminal') &&
            renderSection(
              '💻 Terminals by Configured Account',
              state.aiAccounts.flatMap((acc: AIAccount) => {
                const cmd = getProviderCliCommand(acc.providerId, acc)
                const cliName =
                  acc.providerId === 'claude'
                    ? 'claude'
                    : acc.providerId === 'chatgpt'
                      ? 'codex'
                      : acc.providerId === 'gemini'
                        ? 'agy'
                        : ''
                const icon =
                  acc.providerId === 'claude'
                    ? '🧠'
                    : acc.providerId === 'chatgpt'
                      ? '🤖'
                      : acc.providerId === 'gemini'
                        ? '💎'
                        : '🦁'
                const shellItem = renderItem(
                  <span style={{ fontSize: '15px' }}>{icon}</span>,
                  `Shell: ${acc.name}${acc.isDefault ? ' (★ Default)' : ''}`,
                  `Open interactive shell with ${accountProfileLabel(acc)} profile`,
                  () => {
                    onNewTerminal(
                      '~',
                      `${acc.name} (Shell)`,
                      undefined,
                      acc.providerId,
                      acc.id,
                      getAccountEnv(acc)
                    )
                    close()
                  },
                  '#81c784'
                )
                if (!cmd || !cliName) return [shellItem]
                return [
                  shellItem,
                  renderItem(
                    <span style={{ fontSize: '15px' }}>⚡</span>,
                    `Agent: ${cliName} ▶ (${acc.name})`,
                    `Launch ${cliName} CLI coding agent in ${acc.name} profile (${cmd})`,
                    () => {
                      onNewTerminal(
                        '~',
                        `${acc.name} (${cliName})`,
                        cmd,
                        acc.providerId,
                        acc.id,
                        getAccountEnv(acc)
                      )
                      close()
                    },
                    '#8baeff'
                  )
                ]
              })
            )}

          {/* Terminal Section */}
          {(categoryFilter === 'all' || categoryFilter === 'terminal') &&
            renderSection('🖥 Generic Terminal Sessions', [
              renderItem(
                <FolderOpen size={16} />,
                'New Terminal (Browse Directory with Finder...)',
                'Pick any folder with Finder navigation',
                handleNewTerminalWithFolder,
                '#8baeff'
              ),
              renderItem(
                <TerminalSquare size={16} />,
                'New Terminal (Home Directory ~)',
                'Open default shell in ~',
                () => {
                  onNewTerminal('~')
                  close()
                },
                '#aaa'
              ),
              renderItem(
                <ZoomIn size={16} />,
                'Zoom In Terminal Font (⌘+ / ⌘=)',
                'Increase font size across all terminal panes (+1px)',
                () => {
                  window.dispatchEvent(
                    new CustomEvent('nexus-zoom-terminal', { detail: { action: 'in' } })
                  )
                  close()
                },
                '#60a5fa'
              ),
              renderItem(
                <ZoomOut size={16} />,
                'Zoom Out Terminal Font (⌘-)',
                'Decrease font size across all terminal panes (-1px)',
                () => {
                  window.dispatchEvent(
                    new CustomEvent('nexus-zoom-terminal', { detail: { action: 'out' } })
                  )
                  close()
                },
                '#60a5fa'
              ),
              renderItem(
                <RotateCcw size={16} />,
                'Reset Terminal Font Size (⌘0)',
                'Reset terminal font size to default (13.5px)',
                () => {
                  window.dispatchEvent(
                    new CustomEvent('nexus-zoom-terminal', { detail: { action: 'reset' } })
                  )
                  close()
                },
                '#8baeff'
              )
            ])}

          {/* View Modes & Layouts */}
          {(categoryFilter === 'all' || categoryFilter === 'layout') &&
            renderSection('📐 View Modes & 1-Screen Presets', [
              renderItem(
                <LayoutGrid size={16} />,
                '📐 Tidy Layout (Square Up Panes)',
                'Rebalance and square up all parallel agents to stay legible',
                () => {
                  onApplyLayout('tidy')
                  close()
                },
                '#8baeff'
              ),
              renderItem(
                <Sparkles size={16} />,
                '🖥|🌐 Code & Chat (50/50 Split)',
                '50% Terminal + 50% Web Chat side-by-side in one view',
                () => {
                  onApplyLayout('code-chat')
                  close()
                },
                '#ffd54f'
              ),
              renderItem(
                <Columns3 size={16} />,
                '🖥🖥|🌐 2 Terminals Left + 1 WebChat Right',
                'Stacked terminals on left beside full-height web research',
                () => {
                  onApplyLayout('code-2-chat-1')
                  close()
                },
                '#4caf50'
              ),
              renderItem(
                <Columns3 size={16} />,
                '🖥|🌐🌐 1 Terminal Left + 2 WebChats Right',
                'Terminal on left beside 2 stacked web/browser panes',
                () => {
                  onApplyLayout('code-1-chat-2')
                  close()
                },
                '#ff9800'
              ),
              renderItem(
                <LayoutGrid size={16} />,
                '⊞ Quad Split (2 Code Top + 2 Web Bottom)',
                '2x2 grid combining 2 terminals with 2 web chats',
                () => {
                  onApplyLayout('quad-code-chat')
                  close()
                },
                '#e91e63'
              ),
              renderItem(
                <Columns3 size={16} />,
                '⬚ 3-Way Split: Code | Brave Browser | AI Chat',
                'Terminal (33%) | Brave Browser (33%) | AI Assistant (33%)',
                () => {
                  onApplyLayout('tri-code-brave-chat')
                  close()
                },
                '#9c27b0'
              ),
              renderItem(
                <Star size={16} />,
                '◫ Focus Master (58%) + Tiled Others (42%)',
                'Keep 1 terminal focused large while running other terminals tiled simultaneously',
                () => {
                  dispatch({ type: 'SET_VIEW_MODE', viewMode: 'split' })
                  close()
                },
                '#8baeff'
              ),
              renderItem(
                <Maximize2 size={16} />,
                state.viewMode === 'full'
                  ? 'Switch to Grid Layout'
                  : 'Switch to Full Session View (100%)',
                state.viewMode === 'full'
                  ? 'Tile terminals in multi-pane grid'
                  : 'Maximize active terminal to 100% of workspace',
                () => {
                  if (state.viewMode === 'full') {
                    dispatch({ type: 'SET_VIEW_MODE', viewMode: 'grid' })
                    dispatch({ type: 'SET_ACTIVE_SESSION', id: null })
                  } else {
                    if (state.terminals.length > 0) {
                      dispatch({ type: 'SET_ACTIVE_SESSION', id: state.terminals[0].id })
                    }
                  }
                  close()
                },
                '#ffc107'
              ),
              renderItem(<TerminalSquare size={16} />, 'Solo Layout', 'Single pane view', () => {
                onApplyLayout('solo')
                close()
              }),
              renderItem(<Columns2 size={16} />, '2 Side-by-Side (Pair)', '50% / 50% split', () => {
                onApplyLayout('pair')
                close()
              }),
              renderItem(
                <Columns3 size={16} />,
                '3 Side-by-Side (Swarm)',
                '33% / 33% / 33% parallel layout',
                () => {
                  onApplyLayout('swarm')
                  close()
                }
              ),
              renderItem(
                <PanelTop size={16} />,
                '1 Big Master + 3 Columns',
                'Full-width top master terminal with 3 bottom panes',
                () => {
                  onApplyLayout('master-3')
                  close()
                }
              ),
              renderItem(
                <PanelsTopBottom size={16} />,
                '2 Top + 3 Bottom (2 Rows)',
                '2 side-by-side on Row 1, 3 side-by-side on Row 2',
                () => {
                  onApplyLayout('combo-2-3')
                  close()
                }
              ),
              renderItem(<LayoutGrid size={16} />, 'Workbench Layout', '2×2 grid layout', () => {
                onApplyLayout('workbench')
                close()
              }),
              renderItem(
                <SplitSquareHorizontal size={16} />,
                'Stack Layout',
                'Vertical split stack',
                () => {
                  onApplyLayout('stack')
                  close()
                }
              )
            ])}
        </div>
      </div>
    </div>
  )
}
