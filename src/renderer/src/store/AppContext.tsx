/* eslint-disable react-refresh/only-export-components */
import { createContext, useReducer, useContext, ReactNode, Dispatch } from 'react'
import { AIAccount } from '../types'

// ─── Types ───────────────────────────────────────────
export type AppMode = 'agent' | 'code' | 'chat' | 'usage' | 'notes' | 'api'
export type ViewMode = 'grid' | 'split' | 'full'
export type AgentStatus = 'idle' | 'working' | 'done' | 'waiting' | 'error'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface AgentSession {
  id: string
  name: string
  providerId: string
  status: AgentStatus
  brief: string
  startedAt: number
  messages: ChatMessage[]
  linkedTerminalId?: string
}

export interface TerminalAgentState {
  status: AgentStatus
  promptQuestion?: string
  question?: string
  lastActiveAt: number
  cliType?: string
  reason?: string
}

export interface TerminalSession {
  id: string
  name: string
  cwd: string
  command?: string
  providerId: string
  accountId?: string
  env?: Record<string, string>
  agentState?: TerminalAgentState
}

export interface FolderExplorerState {
  open: boolean
  title: string
  onSelect: ((path: string) => void) | null
}

export interface AppState {
  mode: AppMode
  viewMode: ViewMode
  activeSessionId: string | null
  focusSessionId: string | null
  dockedSessionIds: string[]
  terminals: TerminalSession[]
  agents: AgentSession[]
  aiAccounts: AIAccount[]
  detectedCLIs: string[]
  sidebarOpen: boolean
  threadPanelOpen: boolean
  activeThreadId: string | null
  showPalette: boolean
  showSettings: boolean
  folderExplorer: FolderExplorerState
  keepAwake: boolean
}

// ─── Actions ─────────────────────────────────────────
export type AppAction =
  | { type: 'SET_MODE'; mode: AppMode }
  | { type: 'SET_VIEW_MODE'; viewMode: ViewMode }
  | { type: 'SET_ACTIVE_SESSION'; id: string | null }
  | { type: 'SET_FOCUS_SESSION'; id: string | null }
  | { type: 'DOCK_SESSION'; id: string }
  | { type: 'UNDOCK_SESSION'; id: string }
  | { type: 'ADD_TERMINAL'; terminal: TerminalSession }
  | { type: 'RESTORE_SESSIONS'; terminals: TerminalSession[]; dockedIds: string[] }
  | { type: 'REMOVE_TERMINAL'; id: string }
  | { type: 'ADD_AGENT'; agent: AgentSession }
  | { type: 'REMOVE_AGENT'; id: string }
  | { type: 'UPDATE_AGENT_STATUS'; id: string; status: AgentStatus }
  | { type: 'APPEND_MESSAGE'; agentId: string; message: ChatMessage }
  | { type: 'SET_AI_ACCOUNTS'; accounts: AIAccount[] }
  | { type: 'SET_DETECTED_CLIS'; clis: string[] }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'OPEN_THREAD'; agentId: string }
  | { type: 'CLOSE_THREAD' }
  | { type: 'SET_SHOW_PALETTE'; show: boolean }
  | { type: 'SET_SHOW_SETTINGS'; show: boolean }
  | {
      type: 'OPEN_FOLDER_EXPLORER'
      title?: string
      onSelect: (path: string) => void
    }
  | { type: 'CLOSE_FOLDER_EXPLORER' }
  | {
      type: 'UPDATE_TERMINAL_AGENT_STATE'
      id: string
      agentState: TerminalAgentState
    }
  | {
      type: 'UPDATE_TERMINAL_ACCOUNT'
      id: string
      accountId?: string
      providerId?: string
      env?: Record<string, string>
    }
  | {
      type: 'RENAME_TERMINAL'
      id: string
      name: string
    }
  | { type: 'SET_KEEP_AWAKE'; enabled: boolean }

// ─── Reducer ─────────────────────────────────────────
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.mode }
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.viewMode }
    case 'SET_ACTIVE_SESSION':
      return { ...state, activeSessionId: action.id }
    case 'SET_FOCUS_SESSION':
      return { ...state, focusSessionId: action.id }
    case 'DOCK_SESSION':
      return {
        ...state,
        dockedSessionIds: Array.from(new Set([...state.dockedSessionIds, action.id])),
        activeSessionId: state.activeSessionId === action.id ? null : state.activeSessionId,
        viewMode: state.activeSessionId === action.id && state.viewMode === 'full' ? 'grid' : state.viewMode
      }
    case 'UNDOCK_SESSION':
      return {
        ...state,
        dockedSessionIds: state.dockedSessionIds.filter((id) => id !== action.id)
      }
    case 'ADD_TERMINAL':
      return { ...state, terminals: [...state.terminals, action.terminal] }
    case 'RESTORE_SESSIONS':
      return { ...state, terminals: action.terminals, dockedSessionIds: action.dockedIds }
    case 'REMOVE_TERMINAL':
      return {
        ...state,
        terminals: state.terminals.filter((t) => t.id !== action.id),
        dockedSessionIds: state.dockedSessionIds.filter((id) => id !== action.id),
        activeSessionId: state.activeSessionId === action.id ? null : state.activeSessionId,
        focusSessionId: state.focusSessionId === action.id ? null : state.focusSessionId
      }
    case 'ADD_AGENT':
      return { ...state, agents: [...state.agents, action.agent] }
    case 'REMOVE_AGENT':
      return { ...state, agents: state.agents.filter((a) => a.id !== action.id) }
    case 'UPDATE_AGENT_STATUS':
      return {
        ...state,
        agents: state.agents.map((a) => (a.id === action.id ? { ...a, status: action.status } : a))
      }
    case 'APPEND_MESSAGE':
      return {
        ...state,
        agents: state.agents.map((a) =>
          a.id === action.agentId ? { ...a, messages: [...a.messages, action.message] } : a
        )
      }
    case 'SET_AI_ACCOUNTS':
      return { ...state, aiAccounts: action.accounts }
    case 'SET_DETECTED_CLIS':
      return { ...state, detectedCLIs: action.clis }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen }
    case 'OPEN_THREAD':
      return { ...state, threadPanelOpen: true, activeThreadId: action.agentId }
    case 'CLOSE_THREAD':
      return { ...state, threadPanelOpen: false, activeThreadId: null }
    case 'SET_SHOW_PALETTE':
      return { ...state, showPalette: action.show }
    case 'SET_SHOW_SETTINGS':
      return { ...state, showSettings: action.show }
    case 'OPEN_FOLDER_EXPLORER':
      return {
        ...state,
        folderExplorer: {
          open: true,
          title: action.title || 'Select Working Directory',
          onSelect: action.onSelect
        }
      }
    case 'CLOSE_FOLDER_EXPLORER':
      return {
        ...state,
        folderExplorer: {
          open: false,
          title: '',
          onSelect: null
        }
      }
    case 'UPDATE_TERMINAL_AGENT_STATE':
      return {
        ...state,
        terminals: state.terminals.map((t) =>
          t.id === action.id ? { ...t, agentState: action.agentState } : t
        )
      }
    case 'UPDATE_TERMINAL_ACCOUNT':
      return {
        ...state,
        terminals: state.terminals.map((t) =>
          t.id === action.id
            ? {
                ...t,
                accountId: action.accountId,
                providerId: action.providerId || t.providerId,
                env: action.env
              }
            : t
        )
      }
    case 'RENAME_TERMINAL':
      return {
        ...state,
        terminals: state.terminals.map((t) =>
          t.id === action.id ? { ...t, name: action.name } : t
        )
      }
    case 'SET_KEEP_AWAKE':
      return { ...state, keepAwake: action.enabled }
    default:
      return state
  }
}

// ─── Initial State ───────────────────────────────────
const initialState: AppState = {
  mode: 'code',
  viewMode: 'grid',
  activeSessionId: null,
  focusSessionId: null,
  dockedSessionIds: [],
  terminals: [{ id: 'term-1', name: 'Main-1', cwd: '~', providerId: 'local' }],
  agents: [],
  aiAccounts: [],
  detectedCLIs: [],
  sidebarOpen: true,
  threadPanelOpen: false,
  activeThreadId: null,
  showPalette: false,
  showSettings: false,
  folderExplorer: {
    open: false,
    title: '',
    onSelect: null
  },
  keepAwake: false
}

// ─── Context ─────────────────────────────────────────
const AppContext = createContext<{ state: AppState; dispatch: Dispatch<AppAction> } | null>(null)

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(appReducer, initialState)
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useApp(): { state: AppState; dispatch: Dispatch<AppAction> } {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
