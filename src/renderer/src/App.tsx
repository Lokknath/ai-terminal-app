import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import { Responsive, Layout, LayoutItem, ResponsiveLayouts } from 'react-grid-layout/legacy'
import { AppProvider, useApp, type AppMode } from './store/AppContext'
import HeaderBar, { LayoutPresetType } from './components/HeaderBar'
import AgentSidebar from './components/AgentSidebar'
import TerminalPane from './components/TerminalPane'
import WebChatPane from './components/WebChatPane'
import ChatThread from './components/ChatThread'
import CommandPalette from './components/CommandPalette'
import SettingsModal from './components/SettingsModal'
import AgentDashboard from './components/AgentDashboard'
import UsagePanel from './components/UsagePanel'
import ChatWorkspace from './components/ChatWorkspace'
import FolderExplorerModal from './components/FolderExplorerModal'
import NewPanelModal from './components/NewPanelModal'
import AttentionNotificationToast from './components/AttentionNotificationToast'
import StatusBar from './components/StatusBar'
import { ArrowLeft, Move, Terminal, Plus, Bot, Globe, Columns, Sparkles } from 'lucide-react'
import { getAccountEnv, getProviderCliCommand, type AIAccount } from './types'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const NotesWorkspace = lazy(() => import('./components/NotesWorkspace'))
const ApiWorkspace = lazy(() => import('./components/ApiWorkspace'))

export interface GridPane {
  id: string
  type: 'terminal' | 'webchat'
  name: string
  cwd?: string
  command?: string
  url?: string
  partition?: string
  providerId?: string
  accountId?: string
  env?: Record<string, string>
}

const initialLayoutItem: LayoutItem = { i: 'term-1', x: 0, y: 0, w: 12, h: 8, minW: 2, minH: 2 }
const workspaceKey = 'nexus-workspace-v1'

function readWorkspace(): { panes: GridPane[]; layouts: ResponsiveLayouts; dockedIds: string[] } {
  const fallback = {
    panes: [
      { id: 'term-1', type: 'terminal' as const, name: 'Main-1', cwd: '~', providerId: 'local' }
    ],
    layouts: {
      lg: [initialLayoutItem],
      md: [initialLayoutItem],
      sm: [initialLayoutItem],
      xs: [initialLayoutItem],
      xxs: [initialLayoutItem]
    },
    dockedIds: [] as string[]
  }
  try {
    const raw = localStorage.getItem(workspaceKey)
    if (!raw) return fallback
    const saved = JSON.parse(raw) as {
      panes?: GridPane[]
      layouts?: ResponsiveLayouts
      dockedIds?: string[]
    }
    if (!Array.isArray(saved.panes)) return fallback
    const ids = new Set<string>()
    const panes = saved.panes
      .filter((pane) => {
        if (
          !pane ||
          typeof pane.id !== 'string' ||
          typeof pane.name !== 'string' ||
          !['terminal', 'webchat'].includes(pane.type) ||
          ids.has(pane.id)
        )
          return false
        if (
          pane.type === 'webchat' &&
          (typeof pane.url !== 'string' || !/^https?:\/\//i.test(pane.url))
        )
          return false
        ids.add(pane.id)
        return true
      })
      .map((pane) => ({ ...pane, env: undefined })) // Never restore environment variables or tokens.
    const dockedIds = (saved.dockedIds || []).filter((id) => ids.has(id))
    const layout = saved.layouts?.lg
    const validLayout =
      Array.isArray(layout) &&
      layout.length === panes.length &&
      layout.every(
        (item) => ids.has(item.i) && [item.x, item.y, item.w, item.h].every(Number.isFinite)
      )
    const items = validLayout
      ? layout
      : computeLayoutBoxes('tidy', panes).map((box) => ({
          i: box.id,
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
          minW: 2,
          minH: 2
        }))
    return { panes, dockedIds, layouts: { lg: items, md: items, sm: items, xs: items, xxs: items } }
  } catch {
    return fallback
  }
}

function computeLayoutBoxes(
  type: LayoutPresetType,
  paneList: GridPane[]
): { id: string; name: string; x: number; y: number; w: number; h: number }[] {
  return paneList.map((pane, i) => {
    if (type === 'solo') {
      return { id: pane.id, name: pane.name, x: 0, y: 0, w: 12, h: 8 }
    }
    if (type === 'tidy') {
      const count = paneList.length
      if (count <= 1) {
        return { id: pane.id, name: pane.name, x: 0, y: 0, w: 12, h: 8 }
      }
      if (count === 2) {
        return { id: pane.id, name: pane.name, x: (i % 2) * 6, y: 0, w: 6, h: 8 }
      }
      if (count === 3) {
        return { id: pane.id, name: pane.name, x: (i % 3) * 4, y: 0, w: 4, h: 8 }
      }
      if (count === 4) {
        return {
          id: pane.id,
          name: pane.name,
          x: (i % 2) * 6,
          y: Math.floor(i / 2) * 4,
          w: 6,
          h: 4
        }
      }
      if (count <= 6) {
        return {
          id: pane.id,
          name: pane.name,
          x: (i % 3) * 4,
          y: Math.floor(i / 3) * 4,
          w: 4,
          h: 4
        }
      }
      return {
        id: pane.id,
        name: pane.name,
        x: (i % 4) * 3,
        y: Math.floor(i / 4) * 4,
        w: 3,
        h: 4
      }
    }
    if (type === 'pair') {
      return {
        id: pane.id,
        name: pane.name,
        x: (i % 2) * 6,
        y: Math.floor(i / 2) * (paneList.length <= 2 ? 8 : 4),
        w: 6,
        h: paneList.length <= 2 ? 8 : 4
      }
    }
    if (type === 'code-chat') {
      const termPane = paneList.find((p) => p.type === 'terminal') || paneList[0]
      const webPane =
        paneList.find((p) => p.type === 'webchat' && p.id !== termPane?.id) || paneList[1]
      if (pane.id === termPane?.id) {
        return { id: pane.id, name: pane.name, x: 0, y: 0, w: 6, h: 8 }
      }
      if (pane.id === webPane?.id) {
        return { id: pane.id, name: pane.name, x: 6, y: 0, w: 6, h: 8 }
      }
      return { id: pane.id, name: pane.name, x: (i % 2) * 6, y: 8, w: 6, h: 4 }
    }
    if (type === 'code-2-chat-1') {
      const termPanes = paneList.filter((p) => p.type === 'terminal')
      const webPanes = paneList.filter((p) => p.type === 'webchat')
      const t1 = termPanes[0] || paneList[0]
      const t2 = termPanes[1] || paneList[1]
      const w1 = webPanes[0] || paneList.find((p) => p.id !== t1?.id && p.id !== t2?.id)

      if (pane.id === t1?.id) return { id: pane.id, name: pane.name, x: 0, y: 0, w: 6, h: 4 }
      if (pane.id === t2?.id) return { id: pane.id, name: pane.name, x: 0, y: 4, w: 6, h: 4 }
      if (pane.id === w1?.id) return { id: pane.id, name: pane.name, x: 6, y: 0, w: 6, h: 8 }
      return {
        id: pane.id,
        name: pane.name,
        x: (i % 2) * 6,
        y: 8 + Math.floor(i / 2) * 4,
        w: 6,
        h: 4
      }
    }
    if (type === 'code-1-chat-2') {
      const termPanes = paneList.filter((p) => p.type === 'terminal')
      const webPanes = paneList.filter((p) => p.type === 'webchat')
      const t1 = termPanes[0] || paneList[0]
      const w1 = webPanes[0] || paneList.find((p) => p.id !== t1?.id)
      const w2 = webPanes[1] || paneList.find((p) => p.id !== t1?.id && p.id !== w1?.id)

      if (pane.id === t1?.id) return { id: pane.id, name: pane.name, x: 0, y: 0, w: 6, h: 8 }
      if (pane.id === w1?.id) return { id: pane.id, name: pane.name, x: 6, y: 0, w: 6, h: 4 }
      if (pane.id === w2?.id) return { id: pane.id, name: pane.name, x: 6, y: 4, w: 6, h: 4 }
      return {
        id: pane.id,
        name: pane.name,
        x: (i % 2) * 6,
        y: 8 + Math.floor(i / 2) * 4,
        w: 6,
        h: 4
      }
    }
    if (type === 'quad-code-chat') {
      const termPanes = paneList.filter((p) => p.type === 'terminal')
      const webPanes = paneList.filter((p) => p.type === 'webchat')
      const t1 = termPanes[0] || paneList[0]
      const t2 = termPanes[1] || paneList[1]
      const w1 = webPanes[0] || paneList[2]
      const w2 = webPanes[1] || paneList[3]

      if (pane.id === t1?.id) return { id: pane.id, name: pane.name, x: 0, y: 0, w: 6, h: 4 }
      if (pane.id === t2?.id) return { id: pane.id, name: pane.name, x: 6, y: 0, w: 6, h: 4 }
      if (pane.id === w1?.id) return { id: pane.id, name: pane.name, x: 0, y: 4, w: 6, h: 4 }
      if (pane.id === w2?.id) return { id: pane.id, name: pane.name, x: 6, y: 4, w: 6, h: 4 }
      return {
        id: pane.id,
        name: pane.name,
        x: (i % 2) * 6,
        y: 8 + Math.floor(i / 2) * 4,
        w: 6,
        h: 4
      }
    }
    if (type === 'tri-code-brave-chat') {
      const termPane = paneList.find((p) => p.type === 'terminal') || paneList[0]
      const bravePane =
        paneList.find(
          (p) =>
            p.type === 'webchat' &&
            (p.url?.includes('brave') || p.name.toLowerCase().includes('brave'))
        ) || paneList.find((p) => p.id !== termPane?.id)
      const chatPane = paneList.find((p) => p.id !== termPane?.id && p.id !== bravePane?.id)

      if (pane.id === termPane?.id) return { id: pane.id, name: pane.name, x: 0, y: 0, w: 4, h: 8 }
      if (pane.id === bravePane?.id) return { id: pane.id, name: pane.name, x: 4, y: 0, w: 4, h: 8 }
      if (pane.id === chatPane?.id) return { id: pane.id, name: pane.name, x: 8, y: 0, w: 4, h: 8 }
      return { id: pane.id, name: pane.name, x: (i % 3) * 4, y: 8, w: 4, h: 4 }
    }
    if (type === 'swarm') {
      return {
        id: pane.id,
        name: pane.name,
        x: (i % 3) * 4,
        y: Math.floor(i / 3) * (paneList.length <= 3 ? 8 : 4),
        w: 4,
        h: paneList.length <= 3 ? 8 : 4
      }
    }
    if (type === 'master-3') {
      if (i === 0) {
        return { id: pane.id, name: pane.name, x: 0, y: 0, w: 12, h: 5 }
      }
      const subIndex = i - 1
      return {
        id: pane.id,
        name: pane.name,
        x: (subIndex % 3) * 4,
        y: 5 + Math.floor(subIndex / 3) * 4,
        w: 4,
        h: 4
      }
    }
    if (type === 'combo-2-3') {
      if (i < 2) {
        return {
          id: pane.id,
          name: pane.name,
          x: (i % 2) * 6,
          y: 0,
          w: 6,
          h: 4
        }
      }
      const subIndex = i - 2
      return {
        id: pane.id,
        name: pane.name,
        x: (subIndex % 3) * 4,
        y: 4 + Math.floor(subIndex / 3) * 4,
        w: 4,
        h: 4
      }
    }
    if (type === 'workbench') {
      return {
        id: pane.id,
        name: pane.name,
        x: (i % 2) * 6,
        y: Math.floor(i / 2) * 4,
        w: 6,
        h: 4
      }
    }
    if (type === 'stack') {
      return {
        id: pane.id,
        name: pane.name,
        x: 0,
        y: i * 4,
        w: 12,
        h: 4
      }
    }
    if (type === 'sidebar') {
      return i === 0
        ? { id: pane.id, name: pane.name, x: 0, y: 0, w: 4, h: 8 }
        : { id: pane.id, name: pane.name, x: 4, y: (i - 1) * 4, w: 8, h: 4 }
    }
    return {
      id: pane.id,
      name: pane.name,
      x: (i % 2) * 6,
      y: Math.floor(i / 2) * 4,
      w: 6,
      h: 4
    }
  })
}

function AppShell(): JSX.Element {
  const { state, dispatch } = useApp()
  const [savedWorkspace] = useState(readWorkspace)
  const [panes, setPanes] = useState<GridPane[]>(savedWorkspace.panes)
  const [layouts, setLayouts] = useState<ResponsiveLayouts>(savedWorkspace.layouts)
  const [accountsReady, setAccountsReady] = useState(false)
  const [appError, setAppError] = useState<string | null>(null)
  const [hoveredLayout, setHoveredLayout] = useState<LayoutPresetType | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [draggedPaneId, setDraggedPaneId] = useState<string | null>(null)
  const [activeDropZone, setActiveDropZone] = useState<
    'left' | 'right' | 'top' | 'bottom' | 'full' | 'dock' | null
  >(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [justCycledId, setJustCycledId] = useState<string | null>(null)
  const lastCmdWRef = useRef<{ id: string; time: number } | null>(null)
  const sidebarOpenRef = useRef(state.sidebarOpen)
  const codeWorkspaceRef = useRef<HTMLDivElement>(null)
  const [gridWidth, setGridWidth] = useState(1200)
  const [gridHeight, setGridHeight] = useState(760)

  useEffect(() => {
    const container = codeWorkspaceRef.current
    if (!container || state.mode !== 'code') return
    // Measure both axes so an eight-row workspace fits the visible window at any size.
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      setGridWidth(Math.max(1, Math.floor(entry.contentRect.width)))
      setGridHeight(Math.max(1, Math.floor(entry.contentRect.height)))
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [state.mode])

  useEffect(() => {
    sidebarOpenRef.current = state.sidebarOpen
  }, [state.sidebarOpen])

  useEffect(() => {
    const compact = window.matchMedia('(max-width: 880px)')
    const closeSidebar = (): void => {
      // Only close when entering a compact viewport. Manual reopening remains possible.
      if (compact.matches && sidebarOpenRef.current) {
        sidebarOpenRef.current = false
        dispatch({ type: 'TOGGLE_SIDEBAR' })
      }
    }
    closeSidebar()
    compact.addEventListener('change', closeSidebar)
    return () => compact.removeEventListener('change', closeSidebar)
  }, [dispatch])

  const hasActiveModal =
    showNewModal || state.showPalette || state.showSettings || state.folderExplorer.open

  useEffect(() => {
    dispatch({
      type: 'RESTORE_SESSIONS',
      terminals: savedWorkspace.panes.map((pane) => ({
        id: pane.id,
        name: pane.name,
        cwd: pane.cwd || '~',
        command: pane.command,
        providerId: pane.providerId || (pane.type === 'webchat' ? 'web' : 'local'),
        accountId: pane.accountId
      })),
      dockedIds: savedWorkspace.dockedIds
    })
  }, [dispatch, savedWorkspace])

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const payload = {
          panes: panes.map((pane) => ({ ...pane, env: undefined })),
          layouts,
          dockedIds: state.dockedSessionIds,
          activeSessionId: state.activeSessionId,
          viewMode: state.viewMode
        }
        localStorage.setItem(workspaceKey, JSON.stringify(payload))
        void window.api.saveWorkspaceSession(payload)
      } catch {
        setAppError('Workspace changes could not be saved on this device.')
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [panes, layouts, state.dockedSessionIds, state.activeSessionId, state.viewMode])

  // Fallback to disk session if localStorage is empty on system restart
  useEffect(() => {
    try {
      if (!localStorage.getItem(workspaceKey)) {
        window.api.loadWorkspaceSession().then((rawDiskSession: unknown) => {
          const diskSession = rawDiskSession as {
            panes?: GridPane[]
            layouts?: ResponsiveLayouts
            dockedIds?: string[]
          } | null
          if (diskSession && Array.isArray(diskSession.panes) && diskSession.panes.length > 0) {
            setPanes(diskSession.panes)
            if (diskSession.layouts) setLayouts(diskSession.layouts)
            if (diskSession.dockedIds) {
              dispatch({
                type: 'RESTORE_SESSIONS',
                terminals: diskSession.panes.map((p) => ({
                  id: p.id,
                  name: p.name,
                  cwd: p.cwd || '~',
                  command: p.command,
                  providerId: p.providerId || (p.type === 'webchat' ? 'web' : 'local'),
                  accountId: p.accountId
                })),
                dockedIds: diskSession.dockedIds
              })
            }
          }
        })
      }
    } catch {
      /* ignore */
    }
  }, [dispatch])

  // Listen to external OAuth redirects caught by loopback server or custom protocols
  useEffect(() => {
    const unsubOAuth = window.electron.ipcRenderer.on('oauth-callback-received', () => {
      window.api.getAIAccounts().then((accounts) => {
        dispatch({ type: 'SET_AI_ACCOUNTS', accounts })
      })
    })

    const unsubProto = window.electron.ipcRenderer.on('oauth-protocol-opened', () => {
      window.api.getAIAccounts().then((accounts) => {
        dispatch({ type: 'SET_AI_ACCOUNTS', accounts })
      })
    })

    return () => {
      unsubOAuth()
      unsubProto()
    }
  }, [dispatch])

  useEffect(() => {
    document.body.classList.toggle('modal-open', hasActiveModal)
  }, [hasActiveModal])

  useEffect(() => {
    document.body.classList.toggle('dragging-active', isDragging)
  }, [isDragging])

  useEffect(() => {
    document.body.classList.toggle('resizing-active', isResizing)
  }, [isResizing])

  // Load account metadata before mounting restored panes. A plain shell must
  // never inherit an account's saved environment values implicitly.
  useEffect(() => {
    let active = true
    let timedOut = false
    const timer = setTimeout(() => {
      if (!active) return
      timedOut = true
      setAppError('Accounts are taking longer to load. Local workspace tools are still available.')
      setAccountsReady(true)
    }, 10_000)
    window.api
      .getAIAccounts()
      .then((accounts) => {
        if (!active) return
        if (timedOut) {
          setAppError('Accounts loaded. Restart account-linked terminals opened while loading.')
        }
        dispatch({ type: 'SET_AI_ACCOUNTS', accounts })
      })
      .catch((error) => {
        if (!active) return
        setAppError(error instanceof Error ? error.message : 'Could not load AI accounts.')
      })
      .finally(() => {
        clearTimeout(timer)
        if (active) setAccountsReady(true)
      })
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [dispatch])

  // Listen for desktop notification click to focus target terminal
  useEffect(() => {
    const removeHandler = window.electron.ipcRenderer.on(
      'notification-focus-terminal',
      (_event, terminalId: string) => {
        if (terminalId) {
          dispatch({ type: 'SET_MODE', mode: 'code' })
          dispatch({ type: 'UNDOCK_SESSION', id: terminalId })
          dispatch({ type: 'SET_ACTIVE_SESSION', id: terminalId })
          dispatch({ type: 'SET_FOCUS_SESSION', id: terminalId })
        }
      }
    )
    return () => {
      if (typeof removeHandler === 'function') {
        removeHandler()
      }
    }
  }, [dispatch])

  // Sync Keep-Awake status on mount
  useEffect(() => {
    let active = true
    window.api
      .getKeepAwakeStatus()
      .then((activeStatus) => {
        if (active) dispatch({ type: 'SET_KEEP_AWAKE', enabled: activeStatus })
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [dispatch])

  // Run-When-Away: Auto-prevent system sleep when any agent in the swarm is working
  useEffect(() => {
    const hasWorkingAgent = state.terminals.some((t) => t.agentState?.status === 'working')
    if (hasWorkingAgent && !state.keepAwake) {
      window.api
        .setKeepAwake(true)
        .then((active) => {
          dispatch({ type: 'SET_KEEP_AWAKE', enabled: active })
        })
        .catch(() => {})
    }
  }, [state.terminals, state.keepAwake, dispatch])

  const rebalanceGridLayout = useCallback((layout: Layout): LayoutItem[] => {
    if (!layout || layout.length <= 1) {
      return (layout || []).map((item) => ({ ...item, x: 0, y: 0, w: 12, h: Math.max(item.h, 6) }))
    }

    const sorted = [...layout].sort((a, b) => {
      if (Math.abs(a.y - b.y) <= 1) {
        return a.x - b.x
      }
      return a.y - b.y
    })

    const rows: LayoutItem[][] = []
    let currentRow: LayoutItem[] = []
    let currentRowY = sorted[0]?.y ?? 0

    for (const item of sorted) {
      if (currentRow.length === 0) {
        currentRow.push(item)
        currentRowY = item.y
      } else if (Math.abs(item.y - currentRowY) <= 2) {
        currentRow.push(item)
      } else {
        rows.push(currentRow)
        currentRow = [item]
        currentRowY = item.y
      }
    }
    if (currentRow.length > 0) {
      rows.push(currentRow)
    }

    let accumulatedY = 0
    const result: LayoutItem[] = []

    for (const row of rows) {
      row.sort((a, b) => a.x - b.x)
      const count = row.length
      const rowHeight = Math.max(...row.map((r) => r.h), 4)

      if (count === 1) {
        result.push({
          ...row[0],
          x: 0,
          y: accumulatedY,
          w: 12,
          h: rowHeight
        })
      } else if (count === 2) {
        result.push({
          ...row[0],
          x: 0,
          y: accumulatedY,
          w: 6,
          h: rowHeight
        })
        result.push({
          ...row[1],
          x: 6,
          y: accumulatedY,
          w: 6,
          h: rowHeight
        })
      } else if (count === 3) {
        result.push({
          ...row[0],
          x: 0,
          y: accumulatedY,
          w: 4,
          h: rowHeight
        })
        result.push({
          ...row[1],
          x: 4,
          y: accumulatedY,
          w: 4,
          h: rowHeight
        })
        result.push({
          ...row[2],
          x: 8,
          y: accumulatedY,
          w: 4,
          h: rowHeight
        })
      } else if (count === 4) {
        row.forEach((item, idx) => {
          result.push({
            ...item,
            x: idx * 3,
            y: accumulatedY,
            w: 3,
            h: rowHeight
          })
        })
      } else {
        const colWidth = Math.max(Math.floor(12 / count), 2)
        row.forEach((item, idx) => {
          result.push({
            ...item,
            x: Math.min(idx * colWidth, 12 - colWidth),
            y: accumulatedY,
            w: colWidth,
            h: rowHeight
          })
        })
      }

      accumulatedY += rowHeight
    }

    return result
  }, [])

  const computeLayoutForPanes = useCallback(
    (paneList: GridPane[]): ResponsiveLayouts => {
      const visible = paneList.filter((p) => !state.dockedSessionIds.includes(p.id))
      let items: LayoutItem[]
      if (visible.length <= 1) {
        items = visible.map((p) => ({
          i: p.id,
          x: 0,
          y: 0,
          w: 12,
          h: 8,
          minW: 2,
          minH: 2
        }))
      } else if (visible.length === 2) {
        items = [
          { i: visible[0].id, x: 0, y: 0, w: 6, h: 8, minW: 2, minH: 2 },
          { i: visible[1].id, x: 6, y: 0, w: 6, h: 8, minW: 2, minH: 2 }
        ]
      } else {
        const boxes = computeLayoutBoxes('tidy', visible)
        items = boxes.map((box) => ({
          i: box.id,
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
          minW: 2,
          minH: 2
        }))
      }
      return {
        lg: items,
        md: items,
        sm: items,
        xs: items,
        xxs: items
      }
    },
    [state.dockedSessionIds]
  )

  const addTerminal = useCallback(
    (
      cwd = '~',
      name?: string,
      command?: string,
      providerId = 'local',
      accountId?: string,
      customEnv?: Record<string, string>
    ) => {
      const newId = `term-${crypto.randomUUID()}`
      const termName = name || `Terminal-${panes.length + 1}`

      // Add saved credentials only when the pane names an account, or when
      // its provider maps to a known account. Ordinary shells remain clean.
      let resolvedEnv: Record<string, string> = customEnv ? { ...customEnv } : {}
      if (accountId) {
        const acc = state.aiAccounts.find((a) => a.id === accountId)
        if (acc) {
          resolvedEnv = { ...getAccountEnv(acc), ...resolvedEnv }
        }
      } else if (providerId && providerId !== 'local' && providerId !== 'web') {
        const matchingAcc = state.aiAccounts.find(
          (a) =>
            a.providerId === providerId ||
            (providerId.startsWith('claude') && a.providerId === 'claude') ||
            (providerId.startsWith('chatgpt') && a.providerId === 'chatgpt') ||
            ((providerId.startsWith('gemini') ||
              providerId.startsWith('agy') ||
              providerId.startsWith('antigravity')) &&
              a.providerId === 'gemini')
        )
        if (matchingAcc) {
          resolvedEnv = { ...getAccountEnv(matchingAcc), ...resolvedEnv }
        }
      }

      const envToPass = Object.keys(resolvedEnv).length > 0 ? resolvedEnv : undefined

      const newPane: GridPane = {
        id: newId,
        type: 'terminal',
        name: termName,
        cwd,
        command,
        providerId,
        accountId,
        env: envToPass
      }
      setPanes((prev) => {
        const nextPanes = [...prev, newPane]
        const nextLayouts = computeLayoutForPanes(nextPanes)
        setLayouts(nextLayouts)
        return nextPanes
      })
      dispatch({
        type: 'ADD_TERMINAL',
        terminal: {
          id: newId,
          name: termName,
          cwd,
          command,
          providerId,
          accountId,
          env: envToPass
        }
      })
      dispatch({ type: 'SET_MODE', mode: 'code' })
      dispatch({ type: 'SET_ACTIVE_SESSION', id: newId })
    },
    [dispatch, panes.length, state.aiAccounts, computeLayoutForPanes]
  )

  const addWebChat = useCallback(
    (url: string, title: string, partition?: string) => {
      const newId = `web-${crypto.randomUUID()}`
      const newPane: GridPane = {
        id: newId,
        type: 'webchat',
        name: title,
        url,
        partition
      }
      setPanes((prev) => {
        const nextPanes = [...prev, newPane]
        const nextLayouts = computeLayoutForPanes(nextPanes)
        setLayouts(nextLayouts)
        return nextPanes
      })
      dispatch({
        type: 'ADD_TERMINAL',
        terminal: { id: newId, name: title, cwd: 'https://', providerId: 'web' }
      })
      dispatch({ type: 'SET_MODE', mode: 'code' })
      dispatch({ type: 'SET_ACTIVE_SESSION', id: newId })
    },
    [dispatch, computeLayoutForPanes]
  )

  const openGeminiInBrowser = useCallback((account: AIAccount): void => {
    void window.api
      .openExternalURL(account.url)
      .then((opened) => {
        if (!opened)
          setAppError(`Could not open ${account.name}. Check its URL and your default browser.`)
      })
      .catch(() => setAppError(`Could not open ${account.name} in your browser.`))
  }, [])

  const removePane = useCallback(
    (idToRemove: string) => {
      window.electron.ipcRenderer.send('pty-kill', idToRemove)
      setPanes((prev) => {
        const remaining = prev.filter((p) => p.id !== idToRemove)
        const nextLayouts = computeLayoutForPanes(remaining)
        setLayouts(nextLayouts)
        return remaining
      })
      dispatch({ type: 'REMOVE_TERMINAL', id: idToRemove })

      // Handle active and focus session transitions if the removed pane was active/focused
      if (state.activeSessionId === idToRemove) {
        const remaining = panes.filter((p) => p.id !== idToRemove)
        dispatch({
          type: 'SET_ACTIVE_SESSION',
          id: remaining.length > 0 ? remaining[0].id : null
        })
      }
      if (state.focusSessionId === idToRemove) {
        const remaining = panes.filter((p) => p.id !== idToRemove)
        dispatch({
          type: 'SET_FOCUS_SESSION',
          id: remaining.length > 0 ? remaining[0].id : null
        })
      }
    },
    [dispatch, panes, computeLayoutForPanes, state.activeSessionId, state.focusSessionId]
  )

  // Global productivity keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey

      if (!isCmdOrCtrl) return

      // ⌘K: Command Palette
      if (e.key.toLowerCase() === 'k' && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        dispatch({ type: 'SET_SHOW_PALETTE', show: !state.showPalette })
        return
      }

      // ⌘,: Settings
      if (e.key === ',' && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        dispatch({ type: 'SET_SHOW_SETTINGS', show: !state.showSettings })
        return
      }

      // ⌘B: Toggle Left Sidebar
      if (e.key.toLowerCase() === 'b' && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        dispatch({ type: 'TOGGLE_SIDEBAR' })
        return
      }

      // ⌘Shift+F: Toggle Full-screen / Maximize pane
      if (e.key.toLowerCase() === 'f' && e.shiftKey) {
        e.preventDefault()
        if (state.viewMode === 'full') {
          dispatch({ type: 'SET_VIEW_MODE', viewMode: 'grid' })
          dispatch({ type: 'SET_ACTIVE_SESSION', id: null })
        } else if (panes.length > 0) {
          dispatch({ type: 'SET_ACTIVE_SESSION', id: state.activeSessionId || panes[0].id })
        }
        return
      }

      // ⌘T: Open New Terminal
      if (e.key.toLowerCase() === 't' && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        addTerminal('~')
        return
      }

      // ⌘+ / ⌘=: Zoom in terminal font
      if ((e.key === '=' || e.key === '+') && !e.altKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('nexus-zoom-terminal', { detail: { delta: 1 } }))
        return
      }

      // ⌘-: Zoom out terminal font
      if (e.key === '-' && !e.altKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('nexus-zoom-terminal', { detail: { delta: -1 } }))
        return
      }

      // ⌘0: Reset terminal font
      if (e.key === '0' && !e.altKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('nexus-zoom-terminal', { detail: { reset: true } }))
        return
      }

      // ⌘W: Close Current Focused / Active Pane
      if (e.key.toLowerCase() === 'w' && !e.shiftKey && !e.altKey) {
        const targetId =
          state.activeSessionId ||
          state.focusSessionId ||
          (panes.length > 0 ? panes[panes.length - 1].id : null)
        if (targetId) {
          const targetTerminal = state.terminals.find((t) => t.id === targetId)
          const isWorking = targetTerminal?.agentState?.status === 'working'
          const now = Date.now()
          if (
            isWorking &&
            (!lastCmdWRef.current ||
              lastCmdWRef.current.id !== targetId ||
              now - lastCmdWRef.current.time > 2000)
          ) {
            e.preventDefault()
            lastCmdWRef.current = { id: targetId, time: now }
            setAppError('Agent is actively working in this pane. Press ⌘W again to force close.')
            setTimeout(() => setAppError(null), 3500)
            return
          }
          lastCmdWRef.current = null
          e.preventDefault()
          removePane(targetId)
        }
        return
      }

      // ⌘] / ⌘[: Switch to next / previous pane
      if ((e.key === ']' || e.key === '[') && !e.shiftKey && !e.altKey) {
        const visible = panes.filter((p) => !state.dockedSessionIds.includes(p.id))
        if (visible.length > 1) {
          e.preventDefault()
          const currentId = state.activeSessionId || visible[0].id
          const currentIndex = visible.findIndex((p) => p.id === currentId)
          const nextIndex =
            e.key === ']'
              ? (currentIndex + 1) % visible.length
              : (currentIndex - 1 + visible.length) % visible.length
          const nextId = visible[nextIndex].id
          setJustCycledId(nextId)
          setTimeout(() => setJustCycledId(null), 700)
          dispatch({ type: 'SET_ACTIVE_SESSION', id: nextId })
          return
        }
      }

      // ⌘1 - ⌘6: Switch Workspace Modes
      if (!e.shiftKey && !e.altKey) {
        const modeMap: Record<string, AppMode> = {
          '1': 'agent',
          '2': 'code',
          '3': 'chat',
          '4': 'usage',
          '5': 'notes',
          '6': 'api'
        }
        const targetMode = modeMap[e.key]
        if (targetMode) {
          e.preventDefault()
          dispatch({ type: 'SET_MODE', mode: targetMode })
          return
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    dispatch,
    state.showPalette,
    state.showSettings,
    state.viewMode,
    state.activeSessionId,
    state.focusSessionId,
    state.dockedSessionIds,
    panes,
    addTerminal,
    removePane
  ])

  const snapDraggedPane = useCallback(
    (
      paneId: string,
      position: 'left' | 'right' | 'top' | 'bottom' | 'full' | 'quad-tl' | 'quad-tr'
    ) => {
      setLayouts((prev) => {
        const current = prev.lg || []
        const updated = current.map((item) => {
          if (item.i !== paneId) return item
          switch (position) {
            case 'left':
              return { ...item, x: 0, y: 0, w: 6, h: 8 }
            case 'right':
              return { ...item, x: 6, y: 0, w: 6, h: 8 }
            case 'top':
              return { ...item, x: 0, y: 0, w: 12, h: 4 }
            case 'bottom':
              return { ...item, x: 0, y: 4, w: 12, h: 4 }
            case 'full':
              return { ...item, x: 0, y: 0, w: 12, h: 8 }
            case 'quad-tl':
              return { ...item, x: 0, y: 0, w: 6, h: 4 }
            case 'quad-tr':
              return { ...item, x: 6, y: 0, w: 6, h: 4 }
            default:
              return item
          }
        })
        return {
          lg: updated,
          md: updated,
          sm: updated,
          xs: updated,
          xxs: updated
        }
      })
      setIsDragging(false)
      setDraggedPaneId(null)
    },
    []
  )

  const handleQuickResize = useCallback((paneId: string, percent: number) => {
    setLayouts((prev) => {
      const current = prev.lg || []
      const targetW = percent === 33 ? 4 : percent === 50 ? 6 : percent === 67 ? 8 : 12
      const targetItem = current.find((item) => item.i === paneId)
      if (!targetItem) return prev

      const updated = current.map((item) => {
        if (item.i === paneId) {
          return { ...item, w: targetW }
        }
        // If expanded to full width 12, push down pane in same row
        if (targetW === 12 && item.y === targetItem.y) {
          return { ...item, y: item.y + (targetItem.h || 4) }
        }
        // If in same row and target changed to 4 or 8, adjust neighbor to fit remaining
        if (item.y === targetItem.y && Math.abs(item.x - targetItem.x) <= 6 && item.i !== paneId) {
          const neighborW = Math.max(12 - targetW, 3)
          return { ...item, w: neighborW, x: targetItem.x === 0 ? targetW : 0 }
        }
        return item
      })

      return {
        lg: updated,
        md: updated,
        sm: updated,
        xs: updated,
        xxs: updated
      }
    })
  }, [])

  const handleSplitPane = useCallback(
    (
      sourcePaneId: string,
      direction: 'right' | 'down',
      type: 'terminal' | 'webchat',
      targetUrl?: string,
      targetTitle?: string,
      targetPartition?: string,
      targetAccountId?: string,
      targetEnv?: Record<string, string>
    ) => {
      const newId =
        type === 'terminal' ? `term-${crypto.randomUUID()}` : `web-${crypto.randomUUID()}`
      const newName =
        type === 'terminal'
          ? targetTitle || `Terminal-${panes.length + 1}`
          : targetTitle || 'Brave Browser'
      const url = targetUrl || (type === 'webchat' ? 'https://search.brave.com' : undefined)

      let resolvedEnv: Record<string, string> | undefined = targetEnv
      if (type === 'terminal' && targetAccountId && !resolvedEnv) {
        const acc = state.aiAccounts.find((a) => a.id === targetAccountId)
        if (acc) {
          resolvedEnv = getAccountEnv(acc)
        }
      }

      const newPane: GridPane = {
        id: newId,
        type,
        name: newName,
        cwd: '~',
        url,
        partition: targetPartition || (type === 'webchat' ? 'persist:webchat' : undefined),
        accountId: targetAccountId,
        env: resolvedEnv
      }

      setPanes((prev) => [...prev, newPane])
      dispatch({
        type: 'ADD_TERMINAL',
        terminal: {
          id: newId,
          name: newName,
          cwd: type === 'terminal' ? '~' : 'https://',
          providerId: type === 'terminal' ? (targetAccountId ? 'account' : 'local') : 'web',
          accountId: targetAccountId,
          env: resolvedEnv
        }
      })

      setLayouts((prev) => {
        const current = prev.lg || []
        const sourceItem = current.find((item) => item.i === sourcePaneId)
        const updated = current.map((item) => {
          if (item.i === sourcePaneId) {
            if (direction === 'right') {
              return { ...item, w: 6 }
            } else {
              return { ...item, h: 4 }
            }
          }
          return item
        })

        const newItem: LayoutItem =
          direction === 'right'
            ? {
                i: newId,
                x: sourceItem ? (sourceItem.x === 0 ? 6 : 0) : 6,
                y: sourceItem ? sourceItem.y : 0,
                w: 6,
                h: sourceItem ? sourceItem.h : 8,
                minW: 2,
                minH: 2
              }
            : {
                i: newId,
                x: sourceItem ? sourceItem.x : 0,
                y: sourceItem ? sourceItem.y + 4 : 4,
                w: sourceItem ? sourceItem.w : 6,
                h: 4,
                minW: 2,
                minH: 2
              }

        updated.push(newItem)

        return {
          lg: updated,
          md: updated,
          sm: updated,
          xs: updated,
          xxs: updated
        }
      })
    },
    [panes.length, dispatch, state.aiAccounts]
  )

  const applyLayout = useCallback(
    (type: LayoutPresetType) => {
      const currentPanes = [...panes]
      let panesModified = false

      // Auto-populate required panes for combo presets if missing
      if (
        type === 'code-chat' ||
        type === 'code-2-chat-1' ||
        type === 'code-1-chat-2' ||
        type === 'quad-code-chat' ||
        type === 'tri-code-brave-chat'
      ) {
        const termCount = currentPanes.filter((p) => p.type === 'terminal').length
        const webCount = currentPanes.filter((p) => p.type === 'webchat').length

        if (type === 'code-chat') {
          if (webCount === 0) {
            const webId = `web-${crypto.randomUUID()}`
            currentPanes.push({
              id: webId,
              type: 'webchat',
              name: 'Claude.ai',
              url: 'https://claude.ai',
              partition: 'persist:webchat'
            })
            dispatch({
              type: 'ADD_TERMINAL',
              terminal: { id: webId, name: 'Claude.ai', cwd: 'https://', providerId: 'web' }
            })
            panesModified = true
          }
        } else if (type === 'code-2-chat-1') {
          if (termCount < 2) {
            const tId = `term-${crypto.randomUUID()}`
            const name = `Terminal-${currentPanes.length + 1}`
            currentPanes.push({
              id: tId,
              type: 'terminal',
              name,
              cwd: '~',
              providerId: 'local'
            })
            dispatch({
              type: 'ADD_TERMINAL',
              terminal: {
                id: tId,
                name,
                cwd: '~',
                providerId: 'local'
              }
            })
            panesModified = true
          }
          if (webCount === 0) {
            const webId = `web-${crypto.randomUUID()}`
            currentPanes.push({
              id: webId,
              type: 'webchat',
              name: 'Brave Browser',
              url: 'https://search.brave.com',
              partition: 'persist:webchat'
            })
            dispatch({
              type: 'ADD_TERMINAL',
              terminal: { id: webId, name: 'Brave Browser', cwd: 'https://', providerId: 'web' }
            })
            panesModified = true
          }
        } else if (type === 'code-1-chat-2') {
          if (webCount < 2) {
            const bId = `web-${crypto.randomUUID()}`
            const cId = `web-${crypto.randomUUID()}`
            if (webCount === 0) {
              currentPanes.push({
                id: bId,
                type: 'webchat',
                name: 'Brave Browser',
                url: 'https://search.brave.com',
                partition: 'persist:webchat'
              })
              currentPanes.push({
                id: cId,
                type: 'webchat',
                name: 'ChatGPT',
                url: 'https://chatgpt.com',
                partition: 'persist:webchat'
              })
              dispatch({
                type: 'ADD_TERMINAL',
                terminal: { id: bId, name: 'Brave Browser', cwd: 'https://', providerId: 'web' }
              })
              dispatch({
                type: 'ADD_TERMINAL',
                terminal: { id: cId, name: 'ChatGPT', cwd: 'https://', providerId: 'web' }
              })
            } else {
              currentPanes.push({
                id: bId,
                type: 'webchat',
                name: 'Brave Browser',
                url: 'https://search.brave.com',
                partition: 'persist:webchat'
              })
              dispatch({
                type: 'ADD_TERMINAL',
                terminal: { id: bId, name: 'Brave Browser', cwd: 'https://', providerId: 'web' }
              })
            }
            panesModified = true
          }
        } else if (type === 'quad-code-chat') {
          if (termCount < 2) {
            const tId = `term-${crypto.randomUUID()}`
            const name = `Terminal-${currentPanes.length + 1}`
            currentPanes.push({
              id: tId,
              type: 'terminal',
              name,
              cwd: '~',
              providerId: 'local'
            })
            dispatch({
              type: 'ADD_TERMINAL',
              terminal: {
                id: tId,
                name,
                cwd: '~',
                providerId: 'local'
              }
            })
            panesModified = true
          }
          if (webCount < 2) {
            const bId = `web-${crypto.randomUUID()}`
            const cId = `web-${crypto.randomUUID()}`
            if (webCount === 0) {
              currentPanes.push({
                id: bId,
                type: 'webchat',
                name: 'Brave Browser',
                url: 'https://search.brave.com',
                partition: 'persist:webchat'
              })
              currentPanes.push({
                id: cId,
                type: 'webchat',
                name: 'Claude.ai',
                url: 'https://claude.ai',
                partition: 'persist:webchat'
              })
              dispatch({
                type: 'ADD_TERMINAL',
                terminal: { id: bId, name: 'Brave Browser', cwd: 'https://', providerId: 'web' }
              })
              dispatch({
                type: 'ADD_TERMINAL',
                terminal: { id: cId, name: 'Claude.ai', cwd: 'https://', providerId: 'web' }
              })
            } else {
              currentPanes.push({
                id: bId,
                type: 'webchat',
                name: 'Brave Browser',
                url: 'https://search.brave.com',
                partition: 'persist:webchat'
              })
              dispatch({
                type: 'ADD_TERMINAL',
                terminal: { id: bId, name: 'Brave Browser', cwd: 'https://', providerId: 'web' }
              })
            }
            panesModified = true
          }
        } else if (type === 'tri-code-brave-chat') {
          const hasBrave = currentPanes.some(
            (p) =>
              p.type === 'webchat' &&
              (p.url?.includes('brave') || p.name.toLowerCase().includes('brave'))
          )
          const hasOtherChat = currentPanes.some(
            (p) =>
              p.type === 'webchat' &&
              !p.url?.includes('brave') &&
              !p.name.toLowerCase().includes('brave')
          )
          if (!hasBrave) {
            const bId = `web-${crypto.randomUUID()}`
            currentPanes.push({
              id: bId,
              type: 'webchat',
              name: 'Brave Browser',
              url: 'https://search.brave.com',
              partition: 'persist:webchat'
            })
            dispatch({
              type: 'ADD_TERMINAL',
              terminal: { id: bId, name: 'Brave Browser', cwd: 'https://', providerId: 'web' }
            })
            panesModified = true
          }
          if (!hasOtherChat) {
            const cId = `web-${crypto.randomUUID()}`
            currentPanes.push({
              id: cId,
              type: 'webchat',
              name: 'Claude.ai',
              url: 'https://claude.ai',
              partition: 'persist:webchat'
            })
            dispatch({
              type: 'ADD_TERMINAL',
              terminal: { id: cId, name: 'Claude.ai', cwd: 'https://', providerId: 'web' }
            })
            panesModified = true
          }
        }

        if (panesModified) {
          setPanes(currentPanes)
        }
      }

      dispatch({ type: 'SET_VIEW_MODE', viewMode: 'grid' })
      dispatch({ type: 'SET_ACTIVE_SESSION', id: null })

      const visiblePanes = currentPanes.filter((p) => !state.dockedSessionIds.includes(p.id))
      const boxes = computeLayoutBoxes(type, visiblePanes)
      const newLayout: LayoutItem[] = boxes.map((box) => ({
        i: box.id,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        minW: 2,
        minH: 2
      }))
      const allLayouts: ResponsiveLayouts = {
        lg: newLayout,
        md: newLayout,
        sm: newLayout,
        xs: newLayout,
        xxs: newLayout
      }
      setLayouts(allLayouts)
    },
    [panes, state.dockedSessionIds, dispatch]
  )

  const duplicateWebChat = useCallback(
    (sourcePane: GridPane) => {
      const sameScreens = panes.filter(
        (p) =>
          p.type === 'webchat' &&
          (p.url === sourcePane.url ||
            p.name.startsWith(sourcePane.name.replace(/\s*\(Screen \d+\)/, '')))
      )
      const baseName = sourcePane.name.replace(/\s*\(Screen \d+\)/, '')
      const newName = `${baseName} (Screen ${sameScreens.length + 1})`
      addWebChat(
        sourcePane.url || 'https://claude.ai',
        newName,
        sourcePane.partition || 'persist:webchat'
      )
    },
    [panes, addWebChat]
  )

  const openCodeAndChatSplit = useCallback(
    (webUrl = 'https://claude.ai', webTitle = 'Claude.ai') => {
      const currentPanes = [...panes]
      let termPane = currentPanes.find((p) => p.type === 'terminal')
      if (!termPane) {
        const newId = `term-${crypto.randomUUID()}`
        termPane = {
          id: newId,
          type: 'terminal',
          name: 'Terminal-1',
          cwd: '~',
          providerId: 'local'
        }
        currentPanes.push(termPane)
        dispatch({
          type: 'ADD_TERMINAL',
          terminal: { id: newId, name: 'Terminal-1', cwd: '~', providerId: 'local' }
        })
      }
      let webPane = currentPanes.find((p) => p.type === 'webchat')
      if (!webPane) {
        const webId = `web-${crypto.randomUUID()}`
        webPane = {
          id: webId,
          type: 'webchat',
          name: webTitle,
          url: webUrl,
          partition: 'persist:webchat'
        }
        currentPanes.push(webPane)
        dispatch({
          type: 'ADD_TERMINAL',
          terminal: { id: webId, name: webTitle, cwd: 'https://', providerId: 'web' }
        })
      }
      setPanes(currentPanes)
      dispatch({ type: 'SET_VIEW_MODE', viewMode: 'grid' })
      dispatch({ type: 'SET_ACTIVE_SESSION', id: null })

      const newLayout: LayoutItem[] = [
        { i: termPane.id, x: 0, y: 0, w: 6, h: 8, minW: 2, minH: 2 },
        { i: webPane.id, x: 6, y: 0, w: 6, h: 8, minW: 2, minH: 2 }
      ]
      let extraIdx = 0
      currentPanes.forEach((p) => {
        if (p.id !== termPane?.id && p.id !== webPane?.id) {
          newLayout.push({
            i: p.id,
            x: (extraIdx % 2) * 6,
            y: 8 + Math.floor(extraIdx / 2) * 4,
            w: 6,
            h: 4,
            minW: 2,
            minH: 2
          })
          extraIdx++
        }
      })
      const all: ResponsiveLayouts = {
        lg: newLayout,
        md: newLayout,
        sm: newLayout,
        xs: newLayout,
        xxs: newLayout
      }
      setLayouts(all)
    },
    [panes, dispatch]
  )

  const applyFocusSplitLayout = useCallback(
    (targetId?: string) => {
      const visible = panes.filter((p) => !state.dockedSessionIds.includes(p.id))
      const focusTargetId =
        targetId || state.focusSessionId || state.activeSessionId || visible[0]?.id
      if (!focusTargetId) return

      dispatch({ type: 'SET_FOCUS_SESSION', id: focusTargetId })
      dispatch({ type: 'SET_VIEW_MODE', viewMode: 'split' })

      const others = visible.filter((p) => p.id !== focusTargetId)
      const newLayout: LayoutItem[] = [
        { i: focusTargetId, x: 0, y: 0, w: 7, h: 8, minW: 4, minH: 4 }
      ]
      const otherCount = Math.max(others.length, 1)
      const rowH = otherCount <= 2 ? 4 : Math.max(Math.floor(8 / otherCount), 2)
      others.forEach((p, idx) => {
        newLayout.push({
          i: p.id,
          x: 7,
          y: idx * rowH,
          w: 5,
          h: rowH,
          minW: 2,
          minH: 2
        })
      })
      const all: ResponsiveLayouts = {
        lg: newLayout,
        md: newLayout,
        sm: newLayout,
        xs: newLayout,
        xxs: newLayout
      }
      setLayouts(all)
    },
    [panes, state.dockedSessionIds, state.focusSessionId, state.activeSessionId, dispatch]
  )

  const activePane = state.activeSessionId
    ? panes.find((p) => p.id === state.activeSessionId) || panes[0]
    : panes[0]

  const visiblePanes = panes.filter((p) => !state.dockedSessionIds.includes(p.id))
  const gridRowHeight = Math.max(
    52,
    Math.floor((gridHeight - (state.viewMode === 'full' ? 84 : 40)) / 8)
  )
  const responsiveLayouts = useMemo(() => {
    const stacked = (layouts.lg || []).map((item, index) => ({
      ...item,
      x: 0,
      y: index * 6,
      w: 12,
      h: Math.max(item.h, 6)
    }))
    return { ...layouts, sm: stacked, xs: stacked, xxs: stacked }
  }, [layouts])

  return (
    <div
      className="app-shell"
      style={{
        height: '100vh',
        width: '100vw',
        backgroundColor: '#0f0f11',
        backgroundImage: 'radial-gradient(circle at top right, #1a1a24 0%, #0f0f11 100%)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Top Header */}
      <HeaderBar
        onApplyLayout={applyLayout}
        onHoverLayout={setHoveredLayout}
        onNewTerminal={() => addTerminal('~')}
        onToggleFocusSplit={() => {
          if (state.viewMode === 'split') {
            dispatch({ type: 'SET_VIEW_MODE', viewMode: 'grid' })
            applyLayout('pair')
          } else {
            applyFocusSplitLayout()
          }
        }}
        onOpenNewModal={() => setShowNewModal(true)}
      />
      {appError && (
        <div className="app-feedback" role="alert">
          {appError}
          <button onClick={() => setAppError(null)} aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}

      {/* Main 3-Column Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Left: Agent Sidebar */}
        {state.sidebarOpen && (
          <AgentSidebar
            onCloseSession={removePane}
            onOpenTerminalWithAccount={(acc) => {
              const cmd = getProviderCliCommand(acc.providerId)
              addTerminal(
                '~',
                `${acc.name} (${cmd})`,
                cmd,
                acc.providerId,
                acc.id,
                getAccountEnv(acc)
              )
            }}
            onLaunchCLI={(command, name) => {
              dispatch({
                type: 'OPEN_FOLDER_EXPLORER',
                title: `Select Folder for ${name}`,
                onSelect: (folder) => addTerminal(folder, name, command, `${command}-cli`)
              })
            }}
            onOpenAccount={(account) => {
              if (account.providerId === 'gemini') {
                openGeminiInBrowser(account)
              } else {
                addWebChat(account.url, account.name, account.partition)
              }
            }}
          />
        )}

        {/* Center: Dynamic Workspace based on Mode */}
        <div
          className="workspace-main"
          style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}
        >
          {state.mode === 'code' && (
            <div
              className="code-workspace"
              ref={codeWorkspaceRef}
              style={{
                flex: 1,
                overflow: 'auto',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative'
              }}
            >
              {/* Full Session Top Tab Bar Navigation (Persistent session tabs) */}
              {state.viewMode === 'full' && (
                <div
                  style={{
                    padding: '8px 14px',
                    backgroundColor: 'rgba(16, 16, 22, 0.95)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    marginBottom: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px',
                    overflowX: 'auto',
                    zIndex: 80
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flex: 1,
                      overflowX: 'auto'
                    }}
                  >
                    <button
                      onClick={() => {
                        dispatch({ type: 'SET_VIEW_MODE', viewMode: 'grid' })
                        dispatch({ type: 'SET_ACTIVE_SESSION', id: null })
                      }}
                      title="Return to Grid Layout"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '5px 12px',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#fff',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 500,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <ArrowLeft size={13} /> Exit to Grid
                    </button>

                    <div
                      style={{
                        width: '1px',
                        height: '20px',
                        backgroundColor: 'rgba(255,255,255,0.12)',
                        margin: '0 4px'
                      }}
                    />

                    {/* Interactive Tabs for Every Single Open Terminal */}
                    {panes.map((pane) => {
                      const isActive = pane.id === activePane?.id
                      return (
                        <button
                          key={pane.id}
                          onClick={() => dispatch({ type: 'SET_ACTIVE_SESSION', id: pane.id })}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '5px 12px',
                            borderRadius: '6px',
                            border: isActive
                              ? '1px solid rgba(117, 157, 255, 0.45)'
                              : '1px solid rgba(255,255,255,0.06)',
                            backgroundColor: isActive
                              ? 'rgba(117, 157, 255, 0.15)'
                              : 'rgba(255,255,255,0.03)',
                            color: isActive ? '#8baeff' : '#aaa',
                            fontSize: '12px',
                            fontWeight: isActive ? 600 : 400,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.12s'
                          }}
                        >
                          {pane.type === 'terminal' ? (
                            <Terminal size={12} color={isActive ? '#8baeff' : '#777'} />
                          ) : (
                            <Plus size={12} color={isActive ? '#8baeff' : '#777'} />
                          )}
                          <span>{pane.name}</span>
                          {isActive && (
                            <span
                              style={{
                                fontSize: '9px',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(117, 157, 255, 0.25)',
                                color: '#8baeff',
                                fontWeight: 600
                              }}
                            >
                              Active
                            </span>
                          )}
                        </button>
                      )
                    })}

                    <button
                      onClick={() => {
                        if (activePane?.type === 'webchat') {
                          addWebChat('https://search.brave.com', 'Browser', 'persist:research')
                        } else {
                          addTerminal('~')
                        }
                      }}
                      title={
                        activePane?.type === 'webchat' ? 'New browser tab' : 'New terminal tab'
                      }
                      aria-label={
                        activePane?.type === 'webchat' ? 'New browser tab' : 'New terminal tab'
                      }
                      style={{
                        padding: '5px 8px',
                        background: 'transparent',
                        border: '1px dashed rgba(255,255,255,0.2)',
                        borderRadius: '6px',
                        color: '#888',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexShrink: 0
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#666' }}>
                      {panes.findIndex((p) => p.id === activePane?.id) + 1} of {panes.length} Tabs
                    </span>
                  </div>
                </div>
              )}

              {/* Split Mode (Focus Master + Tiles) Top Bar */}
              {state.viewMode === 'split' && (
                <div
                  style={{
                    padding: '8px 14px',
                    backgroundColor: 'rgba(16, 16, 24, 0.95)',
                    border: '1px solid rgba(117, 157, 255, 0.35)',
                    borderRadius: '8px',
                    marginBottom: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5), 0 0 16px rgba(117, 157, 255, 0.1)',
                    zIndex: 80
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '14px', color: '#ffc107' }}>⭐</span>
                    <span style={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}>
                      Focus + Tile Mode:
                    </span>
                    <span
                      style={{
                        color: '#8baeff',
                        backgroundColor: 'rgba(117, 157, 255, 0.15)',
                        border: '1px solid rgba(117, 157, 255, 0.3)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600
                      }}
                    >
                      {panes.find((p) => p.id === (state.focusSessionId || state.activeSessionId))
                        ?.name || 'Master Terminal'}{' '}
                      (Master · 58%)
                    </span>
                    <span style={{ fontSize: '11px', color: '#888' }}>
                      Simultaneous with{' '}
                      {
                        visiblePanes.filter(
                          (p) => p.id !== (state.focusSessionId || state.activeSessionId)
                        ).length
                      }{' '}
                      tiled session(s) on the right (42%)
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      onClick={() => {
                        dispatch({ type: 'SET_VIEW_MODE', viewMode: 'grid' })
                        applyLayout('pair')
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '5px 12px',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#fff',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 500
                      }}
                    >
                      Exit to Tile All
                    </button>
                  </div>
                </div>
              )}

              {/* Grid Layout View Mode with Interactive Drag Guidance and Hover Blueprint */}
              <div style={{ position: 'relative', flex: 1, minHeight: '100%' }}>
                {/* Floating Drag HUD with Live Reactive Snap Options */}
                {isDragging && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '12px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      zIndex: 1000,
                      backgroundColor: 'rgba(16, 16, 24, 0.96)',
                      backdropFilter: 'blur(16px)',
                      border: '1px solid rgba(117, 157, 255, 0.45)',
                      boxShadow:
                        '0 12px 40px rgba(0, 0, 0, 0.8), 0 0 30px rgba(117, 157, 255, 0.3)',
                      borderRadius: '12px',
                      padding: '8px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      maxWidth: '94%'
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
                    >
                      <Move size={15} color="#8baeff" />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                        Moving:{' '}
                        <span style={{ color: '#8baeff' }}>
                          {panes.find((p) => p.id === draggedPaneId)?.name || 'Terminal'}
                        </span>
                      </span>
                    </div>

                    <div
                      style={{
                        width: '1px',
                        height: '20px',
                        backgroundColor: 'rgba(255,255,255,0.15)',
                        flexShrink: 0
                      }}
                    />

                    <span
                      style={{
                        fontSize: '11.5px',
                        color: activeDropZone ? '#8baeff' : '#aaa',
                        fontWeight: 600,
                        flexShrink: 0,
                        transition: 'color 0.15s'
                      }}
                    >
                      {activeDropZone
                        ? `Target: ${activeDropZone.toUpperCase()} (Release to snap)`
                        : 'Drop on edge or choose snap:'}
                    </span>

                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {[
                        {
                          id: 'left' as const,
                          label: '◧ Left 50%',
                          action: () => draggedPaneId && snapDraggedPane(draggedPaneId, 'left')
                        },
                        {
                          id: 'right' as const,
                          label: '◨ Right 50%',
                          action: () => draggedPaneId && snapDraggedPane(draggedPaneId, 'right')
                        },
                        {
                          id: 'top' as const,
                          label: '⬒ Top 50%',
                          action: () => draggedPaneId && snapDraggedPane(draggedPaneId, 'top')
                        },
                        {
                          id: 'bottom' as const,
                          label: '⬓ Bottom 50%',
                          action: () => draggedPaneId && snapDraggedPane(draggedPaneId, 'bottom')
                        },
                        {
                          id: 'full' as const,
                          label: '⤢ Full Screen',
                          action: () => {
                            if (draggedPaneId) {
                              dispatch({ type: 'SET_MODE', mode: 'code' })
                              dispatch({ type: 'UNDOCK_SESSION', id: draggedPaneId })
                              dispatch({ type: 'SET_ACTIVE_SESSION', id: draggedPaneId })
                            }
                          }
                        },
                        {
                          id: 'dock' as const,
                          label: '📥 Dock',
                          action: () =>
                            draggedPaneId && dispatch({ type: 'DOCK_SESSION', id: draggedPaneId })
                        },
                        {
                          id: 'pair-auto' as const,
                          label: '2 Columns',
                          action: () => applyLayout('pair')
                        },
                        {
                          id: 'swarm-auto' as const,
                          label: '3 Columns',
                          action: () => applyLayout('swarm')
                        }
                      ].map((opt) => {
                        const isSelected = activeDropZone === opt.id
                        return (
                          <button
                            key={opt.id}
                            onClick={() => {
                              opt.action()
                              setIsDragging(false)
                              setDraggedPaneId(null)
                              setActiveDropZone(null)
                            }}
                            style={{
                              padding: '5px 11px',
                              backgroundColor: isSelected
                                ? 'rgba(117,157,255,0.35)'
                                : 'rgba(255,255,255,0.06)',
                              border: isSelected
                                ? '1px solid #8baeff'
                                : '1px solid rgba(255,255,255,0.15)',
                              borderRadius: '6px',
                              color: isSelected ? '#8baeff' : '#fff',
                              fontSize: '11.5px',
                              fontWeight: isSelected ? 700 : 500,
                              cursor: 'pointer',
                              transition: 'all 0.12s',
                              whiteSpace: 'nowrap',
                              boxShadow: isSelected
                                ? '0 0 12px rgba(117, 157, 255, 0.4)'
                                : undefined
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(117,157,255,0.25)'
                              e.currentTarget.style.borderColor = '#8baeff'
                              e.currentTarget.style.color = '#8baeff'
                            }}
                            onMouseOut={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
                                e.currentTarget.style.color = '#fff'
                              }
                            }}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Perimeter Visual Drop Target Zones (Active when dragging) */}
                {isDragging && (
                  <>
                    {/* Left Half Drop Zone Target */}
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        bottom: 0,
                        width: '50%',
                        zIndex: 900,
                        pointerEvents: 'none',
                        backgroundColor:
                          activeDropZone === 'left'
                            ? 'rgba(117, 157, 255, 0.22)'
                            : 'rgba(117, 157, 255, 0.03)',
                        border:
                          activeDropZone === 'left'
                            ? '2px dashed #8baeff'
                            : '1px dashed rgba(117, 157, 255, 0.2)',
                        borderRadius: '10px',
                        boxShadow:
                          activeDropZone === 'left'
                            ? '0 0 35px rgba(117, 157, 255, 0.4), inset 0 0 30px rgba(117, 157, 255, 0.2)'
                            : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease-out'
                      }}
                    >
                      <div
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          backgroundColor:
                            activeDropZone === 'left' ? '#1d2a47' : 'rgba(16, 20, 30, 0.8)',
                          border:
                            activeDropZone === 'left'
                              ? '1px solid #8baeff'
                              : '1px solid rgba(255,255,255,0.12)',
                          color: activeDropZone === 'left' ? '#8baeff' : '#aaa',
                          fontSize: '13px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.6)'
                        }}
                      >
                        <span style={{ fontSize: '15px' }}>◧</span>
                        <span>
                          {activeDropZone === 'left'
                            ? 'Release to Snap Left (50%)'
                            : 'Snap Left (Half)'}
                        </span>
                      </div>
                    </div>

                    {/* Right Half Drop Zone Target */}
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        bottom: 0,
                        width: '50%',
                        zIndex: 900,
                        pointerEvents: 'none',
                        backgroundColor:
                          activeDropZone === 'right'
                            ? 'rgba(117, 157, 255, 0.22)'
                            : 'rgba(117, 157, 255, 0.03)',
                        border:
                          activeDropZone === 'right'
                            ? '2px dashed #8baeff'
                            : '1px dashed rgba(117, 157, 255, 0.2)',
                        borderRadius: '10px',
                        boxShadow:
                          activeDropZone === 'right'
                            ? '0 0 35px rgba(117, 157, 255, 0.4), inset 0 0 30px rgba(117, 157, 255, 0.2)'
                            : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease-out'
                      }}
                    >
                      <div
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          backgroundColor:
                            activeDropZone === 'right' ? '#1d2a47' : 'rgba(16, 20, 30, 0.8)',
                          border:
                            activeDropZone === 'right'
                              ? '1px solid #8baeff'
                              : '1px solid rgba(255,255,255,0.12)',
                          color: activeDropZone === 'right' ? '#8baeff' : '#aaa',
                          fontSize: '13px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.6)'
                        }}
                      >
                        <span style={{ fontSize: '15px' }}>◨</span>
                        <span>
                          {activeDropZone === 'right'
                            ? 'Release to Snap Right (50%)'
                            : 'Snap Right (Half)'}
                        </span>
                      </div>
                    </div>

                    {/* Top Half Drop Zone Target */}
                    {activeDropZone === 'top' && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          height: '50%',
                          zIndex: 920,
                          pointerEvents: 'none',
                          backgroundColor: 'rgba(117, 157, 255, 0.24)',
                          border: '2px dashed #8baeff',
                          borderRadius: '10px',
                          boxShadow: '0 0 35px rgba(117, 157, 255, 0.45)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <div
                          style={{
                            padding: '8px 18px',
                            borderRadius: '8px',
                            backgroundColor: '#1d2a47',
                            border: '1px solid #8baeff',
                            color: '#8baeff',
                            fontSize: '13px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.6)'
                          }}
                        >
                          <span style={{ fontSize: '15px' }}>⬒</span>
                          <span>Release to Snap Top (Half)</span>
                        </div>
                      </div>
                    )}

                    {/* Bottom Half Drop Zone Target */}
                    {activeDropZone === 'bottom' && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: '50%',
                          zIndex: 920,
                          pointerEvents: 'none',
                          backgroundColor: 'rgba(117, 157, 255, 0.24)',
                          border: '2px dashed #8baeff',
                          borderRadius: '10px',
                          boxShadow: '0 0 35px rgba(117, 157, 255, 0.45)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <div
                          style={{
                            padding: '8px 18px',
                            borderRadius: '8px',
                            backgroundColor: '#1d2a47',
                            border: '1px solid #8baeff',
                            color: '#8baeff',
                            fontSize: '13px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.6)'
                          }}
                        >
                          <span style={{ fontSize: '15px' }}>⬓</span>
                          <span>Release to Snap Bottom (Half)</span>
                        </div>
                      </div>
                    )}

                    {/* Full Screen Drop Zone Target */}
                    {activeDropZone === 'full' && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          zIndex: 930,
                          pointerEvents: 'none',
                          backgroundColor: 'rgba(117, 157, 255, 0.25)',
                          border: '3px dashed #8baeff',
                          borderRadius: '10px',
                          boxShadow: '0 0 50px rgba(117, 157, 255, 0.5)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <div
                          style={{
                            padding: '12px 24px',
                            borderRadius: '10px',
                            backgroundColor: '#1d2a47',
                            border: '2px solid #8baeff',
                            color: '#fff',
                            fontSize: '15px',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            boxShadow: '0 8px 30px rgba(0,0,0,0.7)'
                          }}
                        >
                          <span style={{ fontSize: '18px' }}>⤢</span>
                          <span>Release to Expand Full Screen</span>
                        </div>
                      </div>
                    )}

                    {/* Left Dock Drop Zone Target */}
                    {activeDropZone === 'dock' && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          bottom: 0,
                          width: '90px',
                          zIndex: 940,
                          pointerEvents: 'none',
                          backgroundColor: 'rgba(239, 188, 105, 0.25)',
                          border: '2px dashed #efbc69',
                          borderRadius: '10px 0 0 10px',
                          boxShadow: '0 0 35px rgba(239, 188, 105, 0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          writingMode: 'vertical-rl',
                          color: '#efbc69',
                          fontWeight: 700,
                          fontSize: '13px',
                          letterSpacing: '1px'
                        }}
                      >
                        📥 Release to Dock
                      </div>
                    )}
                  </>
                )}

                {/* 12-Column Blueprint Guidelines Overlay (Visible during Drag) */}
                {isDragging && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      pointerEvents: 'none',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(12, 1fr)',
                      gap: '12px',
                      zIndex: 0,
                      opacity: 0.35
                    }}
                  >
                    {Array.from({ length: 12 }).map((_, c) => (
                      <div
                        key={c}
                        style={{
                          border: '1px dashed rgba(117, 157, 255, 0.4)',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(117, 157, 255, 0.02)',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'flex-start',
                          paddingTop: '8px'
                        }}
                      >
                        <span
                          style={{
                            fontSize: '9px',
                            color: '#8baeff',
                            fontFamily: 'monospace'
                          }}
                        >
                          Col {c + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ghost Layout Blueprint Overlay (Visible on Hover over Layout Options) */}
                {hoveredLayout && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      pointerEvents: 'none',
                      zIndex: 50
                    }}
                  >
                    {computeLayoutBoxes(hoveredLayout, visiblePanes).map((box, idx) => (
                      <div
                        key={box.id}
                        className="layout-preview-box"
                        style={{
                          position: 'absolute',
                          left: `calc(${(box.x / 12) * 100}% + 12px)`,
                          top: `${box.y * 112 + 12}px`,
                          width: `calc(${(box.w / 12) * 100}% - 24px)`,
                          height: `${box.h * 112 - 12}px`,
                          backgroundColor: 'rgba(117, 157, 255, 0.1)',
                          border: '2px dashed #8baeff',
                          borderRadius: '10px',
                          boxShadow: '0 0 30px rgba(117, 157, 255, 0.25)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: 'rgba(10, 10, 15, 0.85)',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: '1px solid rgba(117, 157, 255, 0.4)'
                          }}
                        >
                          <Terminal size={14} color="#8baeff" />
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                            {box.name}
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              color: '#8baeff',
                              backgroundColor: 'rgba(117, 157, 255, 0.2)',
                              padding: '1px 6px',
                              borderRadius: '4px'
                            }}
                          >
                            Slot {idx + 1}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#888',
                            backgroundColor: 'rgba(0,0,0,0.5)',
                            padding: '2px 8px',
                            borderRadius: '4px'
                          }}
                        >
                          Target: {box.w} × {box.h} cols
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {!accountsReady && (
                  <div className="workspace-loading" role="status">
                    Restoring workspace…
                  </div>
                )}
                {accountsReady && visiblePanes.length === 0 && (
                  <div className="workspace-empty">
                    <div className="workspace-empty-badge">
                      <Sparkles size={18} />
                      <span>Ready to Build</span>
                    </div>
                    <h2>Welcome to Nexus AI Terminal</h2>
                    <p>
                      Select a quick starter or open a custom pane to begin coding and interacting
                      with AI agents.
                    </p>

                    <div className="workspace-starters-grid">
                      <button
                        type="button"
                        className="workspace-starter-card"
                        onClick={() => addTerminal(undefined, undefined, 'Terminal')}
                      >
                        <div className="starter-icon-box">
                          <Terminal size={20} />
                        </div>
                        <div className="starter-info">
                          <strong>Terminal Shell</strong>
                          <span>Local zsh / bash terminal</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        className="workspace-starter-card"
                        onClick={() => addTerminal(undefined, 'claude', 'Claude Code', 'claude')}
                      >
                        <div className="starter-icon-box starter-icon-ai">
                          <Bot size={20} />
                        </div>
                        <div className="starter-info">
                          <strong>Claude Code</strong>
                          <span>Autonomous AI coding assistant</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        className="workspace-starter-card"
                        onClick={() => addWebChat('https://duckduckgo.com', 'Web Browser')}
                      >
                        <div className="starter-icon-box starter-icon-web">
                          <Globe size={20} />
                        </div>
                        <div className="starter-info">
                          <strong>Web Browser</strong>
                          <span>In-app browser & documentation</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        className="workspace-starter-card"
                        onClick={() => {
                          addTerminal(undefined, undefined, 'Terminal')
                          setTimeout(() => {
                            addTerminal(undefined, 'claude', 'Claude Code', 'claude')
                          }, 100)
                        }}
                      >
                        <div className="starter-icon-box starter-icon-split">
                          <Columns size={20} />
                        </div>
                        <div className="starter-info">
                          <strong>Dual Split</strong>
                          <span>Terminal + Claude side by side</span>
                        </div>
                      </button>
                    </div>

                    <div className="workspace-empty-footer">
                      <button
                        type="button"
                        className="workspace-custom-btn"
                        onClick={() => setShowNewModal(true)}
                      >
                        <Plus size={15} />
                        <span>Custom Pane (Commands, URLs, APIs)...</span>
                      </button>
                    </div>
                  </div>
                )}
                <Responsive
                  className="layout"
                  width={gridWidth}
                  layouts={responsiveLayouts}
                  onLayoutChange={(_layout, allLayouts) => setLayouts(allLayouts)}
                  // Breakpoints use the grid's width after the sidebar, not the outer window.
                  // Keep a two-pane workspace beside the sidebar at the default window size.
                  breakpoints={{ lg: 1200, md: 900, sm: 680, xs: 480, xxs: 0 }}
                  cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
                  rowHeight={gridRowHeight}
                  draggableHandle=".drag-handle"
                  margin={[8, 8]}
                  containerPadding={[0, 0]}
                  isDraggable={state.viewMode !== 'full'}
                  isResizable={state.viewMode !== 'full'}
                  onResizeStart={() => setIsResizing(true)}
                  onResizeStop={(currentLayout) => {
                    setIsResizing(false)
                    window.dispatchEvent(new Event('resize'))
                    const rebalanced = rebalanceGridLayout(currentLayout)
                    const allLayouts: ResponsiveLayouts = {
                      lg: rebalanced,
                      md: rebalanced,
                      sm: rebalanced,
                      xs: rebalanced,
                      xxs: rebalanced
                    }
                    setLayouts(allLayouts)
                  }}
                  onDragStart={(_layout, oldItem) => {
                    setIsDragging(true)
                    setActiveDropZone(null)
                    if (oldItem) {
                      setDraggedPaneId(oldItem.i)
                    }
                  }}
                  onDrag={(_layout, _oldItem, _newItem, _placeholder, event) => {
                    if (!codeWorkspaceRef.current || !event) return
                    const rect = codeWorkspaceRef.current.getBoundingClientRect()
                    const mouseEvent = event as MouseEvent
                    const clientX = mouseEvent.clientX ?? 0
                    const clientY = mouseEvent.clientY ?? 0

                    const relX = (clientX - rect.left) / rect.width
                    const relY = (clientY - rect.top) / rect.height

                    if (relX < 0.05) {
                      setActiveDropZone('dock')
                    } else if (relX < 0.18) {
                      setActiveDropZone('left')
                    } else if (relX > 0.82) {
                      setActiveDropZone('right')
                    } else if (relY < 0.18 && relX >= 0.35 && relX <= 0.65) {
                      setActiveDropZone('full')
                    } else if (relY < 0.18) {
                      setActiveDropZone('top')
                    } else if (relY > 0.82) {
                      setActiveDropZone('bottom')
                    } else {
                      setActiveDropZone(null)
                    }
                  }}
                  onDragStop={(currentLayout) => {
                    const zone = activeDropZone
                    const paneId = draggedPaneId

                    setIsDragging(false)
                    setDraggedPaneId(null)
                    setActiveDropZone(null)

                    if (paneId && zone) {
                      if (zone === 'left') {
                        snapDraggedPane(paneId, 'left')
                        return
                      }
                      if (zone === 'right') {
                        snapDraggedPane(paneId, 'right')
                        return
                      }
                      if (zone === 'top') {
                        snapDraggedPane(paneId, 'top')
                        return
                      }
                      if (zone === 'bottom') {
                        snapDraggedPane(paneId, 'bottom')
                        return
                      }
                      if (zone === 'full') {
                        dispatch({ type: 'SET_MODE', mode: 'code' })
                        dispatch({ type: 'UNDOCK_SESSION', id: paneId })
                        dispatch({ type: 'SET_ACTIVE_SESSION', id: paneId })
                        return
                      }
                      if (zone === 'dock') {
                        dispatch({ type: 'DOCK_SESSION', id: paneId })
                        return
                      }
                    }

                    const rebalanced = rebalanceGridLayout(currentLayout)
                    const allLayouts: ResponsiveLayouts = {
                      lg: rebalanced,
                      md: rebalanced,
                      sm: rebalanced,
                      xs: rebalanced,
                      xxs: rebalanced
                    }
                    setLayouts(allLayouts)
                  }}
                >
                  {accountsReady &&
                    visiblePanes.map((pane, i) => {
                      const isFull = state.viewMode === 'full'
                      const isActive = pane.id === activePane?.id
                      return (
                        <div
                          key={pane.id}
                          className={`workspace-pane ${justCycledId === pane.id ? 'pane-cycled' : ''} ${
                            isFull
                              ? isActive
                                ? 'pane-fullscreen-elevated'
                                : 'pane-fullscreen-dimmed'
                              : ''
                          }`}
                          data-grid={{
                            x: visiblePanes.length === 1 ? 0 : (i % 2) * 6,
                            y: visiblePanes.length === 1 ? 0 : Math.floor(i / 2) * 4,
                            w: visiblePanes.length === 1 ? 12 : 6,
                            h: visiblePanes.length <= 2 ? 8 : 4,
                            minW: 2,
                            minH: 2
                          }}
                          style={{
                            border: '1px solid rgba(255,255,255,0.08)',
                            backgroundColor: '#121214',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                          }}
                        >
                          {pane.type === 'terminal' ? (
                            <TerminalPane
                              id={pane.id}
                              name={pane.name}
                              cwd={pane.cwd}
                              command={pane.command}
                              providerId={pane.providerId}
                              accountId={pane.accountId}
                              env={pane.env}
                              onFocus={() => applyFocusSplitLayout(pane.id)}
                              onOpenWebBeside={() => openCodeAndChatSplit()}
                              onQuickResize={(pct) => handleQuickResize(pane.id, pct)}
                              onSplitRight={(
                                t,
                                targetUrl,
                                targetTitle,
                                targetPartition,
                                targetAccountId,
                                targetEnv
                              ) =>
                                handleSplitPane(
                                  pane.id,
                                  'right',
                                  t,
                                  targetUrl,
                                  targetTitle,
                                  targetPartition,
                                  targetAccountId,
                                  targetEnv
                                )
                              }
                              onSplitDown={(
                                t,
                                targetUrl,
                                targetTitle,
                                targetPartition,
                                targetAccountId,
                                targetEnv
                              ) =>
                                handleSplitPane(
                                  pane.id,
                                  'down',
                                  t,
                                  targetUrl,
                                  targetTitle,
                                  targetPartition,
                                  targetAccountId,
                                  targetEnv
                                )
                              }
                              onMaximize={() => {
                                dispatch({ type: 'UNDOCK_SESSION', id: pane.id })
                                dispatch({ type: 'SET_ACTIVE_SESSION', id: pane.id })
                              }}
                              onDock={() => dispatch({ type: 'DOCK_SESSION', id: pane.id })}
                              onClose={() => removePane(pane.id)}
                              onAccountChange={(newAccountId, newProviderId, newEnv) => {
                                setPanes((prev) =>
                                  prev.map((p) =>
                                    p.id === pane.id
                                      ? {
                                          ...p,
                                          accountId: newAccountId,
                                          providerId: newProviderId,
                                          env: newEnv
                                        }
                                      : p
                                  )
                                )
                              }}
                            />
                          ) : (
                            <WebChatPane
                              id={pane.id}
                              url={pane.url || 'https://claude.ai'}
                              title={pane.name}
                              partition={pane.partition}
                              onDuplicate={() => duplicateWebChat(pane)}
                              onNewTab={() =>
                                addWebChat(
                                  'https://search.brave.com',
                                  'Browser',
                                  'persist:research'
                                )
                              }
                              onFocus={() => applyFocusSplitLayout(pane.id)}
                              onOpenTermBeside={() => openCodeAndChatSplit(pane.url, pane.name)}
                              onQuickResize={(pct) => handleQuickResize(pane.id, pct)}
                              onSplitRight={(
                                t,
                                targetUrl,
                                targetTitle,
                                targetPartition,
                                targetAccountId,
                                targetEnv
                              ) =>
                                handleSplitPane(
                                  pane.id,
                                  'right',
                                  t,
                                  targetUrl,
                                  targetTitle,
                                  targetPartition,
                                  targetAccountId,
                                  targetEnv
                                )
                              }
                              onSplitDown={(
                                t,
                                targetUrl,
                                targetTitle,
                                targetPartition,
                                targetAccountId,
                                targetEnv
                              ) =>
                                handleSplitPane(
                                  pane.id,
                                  'down',
                                  t,
                                  targetUrl,
                                  targetTitle,
                                  targetPartition,
                                  targetAccountId,
                                  targetEnv
                                )
                              }
                              onMaximize={() => {
                                dispatch({ type: 'UNDOCK_SESSION', id: pane.id })
                                dispatch({ type: 'SET_ACTIVE_SESSION', id: pane.id })
                              }}
                              onDock={() => dispatch({ type: 'DOCK_SESSION', id: pane.id })}
                              onClose={() => removePane(pane.id)}
                              onUrlChange={(newUrl) => {
                                setPanes((prev) =>
                                  prev.map((p) => (p.id === pane.id ? { ...p, url: newUrl } : p))
                                )
                              }}
                            />
                          )}
                        </div>
                      )
                    })}
                </Responsive>
              </div>
            </div>
          )}

          {state.mode === 'agent' && (
            <AgentDashboard
              onOpenAccount={(acc) => addWebChat(acc.url, acc.name, acc.partition)}
              onNewBrowser={() =>
                addWebChat('https://search.brave.com', 'Browser', 'persist:research')
              }
              onLaunchCLI={(command, name, folder) =>
                addTerminal(folder, name, command, `${command}-cli`)
              }
            />
          )}

          {state.mode === 'usage' && (
            <main className="usage-dashboard">
              <UsagePanel onOpenAccount={(acc) => addWebChat(acc.url, acc.name, acc.partition)} />
            </main>
          )}

          {state.mode === 'chat' && <ChatWorkspace />}
          {state.mode === 'notes' && (
            <Suspense fallback={<div className="studio-loading">Opening notebook…</div>}>
              <NotesWorkspace />
            </Suspense>
          )}
          {state.mode === 'api' && (
            <Suspense fallback={<div className="studio-loading">Opening API Studio…</div>}>
              <ApiWorkspace />
            </Suspense>
          )}
        </div>

        {/* Right: Agent Conversation Thread Panel */}
        {state.threadPanelOpen && state.activeThreadId && (
          <ChatThread agentId={state.activeThreadId} />
        )}
      </div>

      <StatusBar
        onToggleSidebar={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
        onOpenPalette={() => dispatch({ type: 'SET_SHOW_PALETTE', show: true })}
        onNewTerminal={() => addTerminal('~')}
        onToggleFocus={() => {
          if (state.viewMode === 'full') {
            dispatch({ type: 'SET_VIEW_MODE', viewMode: 'grid' })
            dispatch({ type: 'SET_ACTIVE_SESSION', id: null })
          } else if (panes.length > 0) {
            dispatch({ type: 'SET_ACTIVE_SESSION', id: state.activeSessionId || panes[0].id })
          }
        }}
      />

      {/* Global Modals */}
      {showNewModal && (
        <NewPanelModal
          onClose={() => setShowNewModal(false)}
          onNewTerminal={(cwd, name, command, providerId, accountId, customEnv) =>
            addTerminal(cwd, name, command, providerId, accountId, customEnv)
          }
          onOpenFolderPicker={(title, onSelect) =>
            dispatch({ type: 'OPEN_FOLDER_EXPLORER', title, onSelect })
          }
          onNewWebChat={(url, title, partition) => addWebChat(url, title, partition)}
          onLaunchCLI={(command, name, accountId, customEnv) => {
            dispatch({
              type: 'OPEN_FOLDER_EXPLORER',
              title: `Select Folder for ${name}`,
              onSelect: (folder) =>
                addTerminal(folder, name, command, `${command}-cli`, accountId, customEnv)
            })
          }}
          onApplyLayoutPreset={(preset) => applyLayout(preset)}
        />
      )}

      {state.showPalette && (
        <CommandPalette
          onNewTerminal={(cwd, name, command, providerId, accountId, customEnv) =>
            addTerminal(cwd, name, command, providerId, accountId, customEnv)
          }
          onNewWebChat={(url, title, partition) => addWebChat(url, title, partition)}
          onLaunchCLI={(command, name, cwd, accountId, customEnv) =>
            addTerminal(cwd || '~', name, command, `${command}-cli`, accountId, customEnv)
          }
          onApplyLayout={applyLayout}
          onOpenFolderPicker={(title, onSelect) =>
            dispatch({ type: 'OPEN_FOLDER_EXPLORER', title, onSelect })
          }
        />
      )}

      {state.showSettings && (
        <SettingsModal
          onOpenAccountLogin={(account) => {
            addWebChat(account.url, account.name, account.partition)
          }}
          onOpenTerminalWithAccount={(account, command) => {
            addTerminal(
              '~',
              `${account.name} Terminal`,
              command,
              account.providerId,
              account.id,
              getAccountEnv(account)
            )
            dispatch({ type: 'SET_MODE', mode: 'code' })
          }}
        />
      )}

      {state.folderExplorer.open && (
        <FolderExplorerModal
          title={state.folderExplorer.title}
          onSelect={(selectedPath) => {
            state.folderExplorer.onSelect?.(selectedPath)
            dispatch({ type: 'CLOSE_FOLDER_EXPLORER' })
          }}
          onClose={() => dispatch({ type: 'CLOSE_FOLDER_EXPLORER' })}
        />
      )}

      {/* Floating Actionable In-App Attention Center for Waiting Agents & Subscriptions */}
      <AttentionNotificationToast />
    </div>
  )
}

export default function App(): JSX.Element {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}
