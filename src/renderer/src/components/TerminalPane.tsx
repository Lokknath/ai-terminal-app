import { useEffect, useRef, useState, useMemo } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import { getProvider } from '../store/providers'
import { useApp, type AgentStatus } from '../store/AppContext'
import {
  RotateCw,
  X,
  Maximize2,
  Pin,
  Star,
  Columns2,
  SplitSquareHorizontal,
  ChevronDown,
  Terminal as TermIcon,
  Check,
  Clipboard,
  CornerDownLeft,
  Globe,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  Copy,
  MoreHorizontal,
  GitBranch,
  Zap,
  Key,
  Edit2,
  MessageSquareQuote,
  Send
} from 'lucide-react'
import {
  AIAccount,
  getAccountEnv,
  getProviderCliLoginCommand,
  getProviderCliCommand
} from '../types'
import {
  detectAgentState,
  stripAnsi,
  type AgentDetectionResult
} from '../utils/agent-state-detector'
import EnvInspectorModal from './EnvInspectorModal'
import { SubscriptionBadge } from './SubscriptionBadge'
import type { GitBranchInfo } from '../../../preload'

interface TerminalPaneProps {
  id: string
  name: string
  cwd?: string
  providerId?: string
  command?: string
  env?: Record<string, string>
  accountId?: string
  onFocus?: () => void
  onOpenWebBeside?: () => void
  onSplitRight?: (
    type: 'terminal' | 'webchat',
    targetUrl?: string,
    targetTitle?: string,
    targetPartition?: string,
    targetAccountId?: string,
    targetEnv?: Record<string, string>
  ) => void
  onSplitDown?: (
    type: 'terminal' | 'webchat',
    targetUrl?: string,
    targetTitle?: string,
    targetPartition?: string,
    targetAccountId?: string,
    targetEnv?: Record<string, string>
  ) => void
  onQuickResize?: (percent: number) => void
  onMaximize?: () => void
  onDock?: () => void
  onClose: () => void
  onRename?: (newName: string) => void
  onSendMessage?: (targetId: string, message: string) => boolean | Promise<boolean>
  onAccountChange?: (
    accountId: string | undefined,
    providerId: string,
    env: Record<string, string>
  ) => void
}

export default function TerminalPane({
  id,
  name,
  cwd = '~',
  providerId = 'local',
  command,
  env,
  accountId,
  onFocus,
  onOpenWebBeside,
  onSplitRight,
  onSplitDown,
  onQuickResize,
  onMaximize,
  onDock,
  onClose,
  onRename,
  onSendMessage,
  onAccountChange
}: TerminalPaneProps): JSX.Element {
  const { state, dispatch } = useApp()
  const terminalRef = useRef<HTMLDivElement>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const termInstanceRef = useRef<Terminal | null>(null)
  const splitMenuRef = useRef<HTMLDivElement>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const localhostMenuRef = useRef<HTMLDivElement>(null)
  const resizeMenuRef = useRef<HTMLDivElement>(null)
  const [showSplitMenu, setShowSplitMenu] = useState<'right' | 'down' | null>(null)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [showLocalhostMenu, setShowLocalhostMenu] = useState(false)
  const [showResizeMenu, setShowResizeMenu] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | 'all'>(accountId || 'all')
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)

  useEffect(() => {
    if (!showCloseConfirm) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setShowCloseConfirm(false)
      } else if (e.key === 'Enter') {
        e.stopPropagation()
        setShowCloseConfirm(false)
        handleClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [showCloseConfirm])

  useEffect(() => {
    if (accountId && accountId !== selectedAccountId) {
      setSelectedAccountId(accountId)
    }
  }, [accountId])
  const [accountOverride, setAccountOverride] = useState(false)
  const [rateLimitPaused, setRateLimitPaused] = useState<{
    message: string
    detectedAt: number
  } | null>(null)
  const [isHandoffRunning, setIsHandoffRunning] = useState(false)
  const [terminalError, setTerminalError] = useState<string | null>(null)
  const [handoffStatus, setHandoffStatus] = useState<string | null>(null)
  const [pasteFeedback, setPasteFeedback] = useState<{ text: string; success: boolean } | null>(
    null
  )
  const [detectedLocalhostUrl, setDetectedLocalhostUrl] = useState<string | null>(null)
  const [agentDetection, setAgentDetection] = useState<AgentDetectionResult>(() => ({
    status: 'idle',
    lastActiveAt: Date.now()
  }))
  const [terminalFontSize, setTerminalFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('nexus-terminal-font-size')
    return saved ? Math.max(10, Math.min(28, parseFloat(saved))) : 14
  })
  const stdoutBufferRef = useRef<string>('')
  const lastNotifiedStatusRef = useRef<string>('')
  const activeSessionIdRef = useRef(state.activeSessionId)
  const lastReportedStatusRef = useRef<string>('idle')
  const detectionDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const manualActionTimestampRef = useRef<number>(0)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [copiedPath, setCopiedPath] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(name)
  const [showSpeakDock, setShowSpeakDock] = useState(false)
  const [targetTerminalId, setTargetTerminalId] = useState<string>('')
  const [speakMessage, setSpeakMessage] = useState<string>('')
  const [speakFeedback, setSpeakFeedback] = useState<string | null>(null)

  const otherTerminals = useMemo(
    () => state.terminals.filter((t) => t.id !== id),
    [state.terminals, id]
  )

  useEffect(() => {
    setNameDraft(name)
  }, [name])

  useEffect(() => {
    if (showSpeakDock && !targetTerminalId && otherTerminals.length > 0) {
      setTargetTerminalId(otherTerminals[0].id)
    }
  }, [showSpeakDock, targetTerminalId, otherTerminals])

  const getLastTerminalLines = (count = 20): string => {
    const term = termInstanceRef.current
    if (!term) return ''
    try {
      const buffer = term.buffer.active
      const lines: string[] = []
      const end = buffer.baseY + buffer.cursorY
      const start = Math.max(0, end - count)
      for (let i = start; i <= end; i++) {
        const line = buffer.getLine(i)
        if (line) lines.push(line.translateToString(true))
      }
      return lines.join('\n').trim()
    } catch {
      return ''
    }
  }

  const handleSendSpeak = async (): Promise<void> => {
    const msg = speakMessage.trim()
    if (!msg || !targetTerminalId) return
    const target = otherTerminals.find((t) => t.id === targetTerminalId)
    if (!target) return

    const formattedPrompt = msg.endsWith('\r') ? msg : `${msg}\r`
    if (onSendMessage) {
      await onSendMessage(targetTerminalId, formattedPrompt)
    } else {
      window.electron.ipcRenderer.send('pty-write', targetTerminalId, formattedPrompt)
    }

    if (termInstanceRef.current) {
      const preview = msg.length > 80 ? `${msg.slice(0, 77)}...` : msg
      termInstanceRef.current.write(
        `\r\n\x1b[35m📤 [Message Sent to ${target.name}]:\x1b[0m \x1b[90m${preview}\x1b[0m\r\n`
      )
    }

    setSpeakFeedback(`Message delivered to ${target.name}`)
    setTimeout(() => setSpeakFeedback(null), 2500)
    setSpeakMessage('')
  }

  const handlePipeOutput = (): void => {
    const lastLines = getLastTerminalLines(25)
    if (!lastLines) return
    setSpeakMessage((prev) => {
      const prefix = `[Context from ${name}]:\n${lastLines}`
      return prev ? `${prev}\n\n${prefix}` : prefix
    })
  }

  const handleSendHandoffToSession = async (): Promise<void> => {
    if (!targetTerminalId) return
    const target = otherTerminals.find((t) => t.id === targetTerminalId)
    if (!target) return
    try {
      const handoff = await window.api.generateHandoffState(
        cwd,
        name,
        `Inter-session task handoff to ${target.name}`
      )
      if (!handoff.success) throw new Error('Could not generate handoff')
      window.electron.ipcRenderer.send('pty-write', targetTerminalId, `${handoff.prompt}\r`)
      if (termInstanceRef.current) {
        termInstanceRef.current.write(
          `\r\n\x1b[32m✔ [Handoff Delivered to ${target.name}]: ${handoff.handoffPath}\x1b[0m\r\n`
        )
      }
      setSpeakFeedback(`Handoff delivered to ${target.name}`)
      setTimeout(() => setSpeakFeedback(null), 2500)
    } catch (err) {
      setSpeakFeedback(err instanceof Error ? err.message : 'Handoff failed')
      setTimeout(() => setSpeakFeedback(null), 3000)
    }
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false)
      }
    }
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMoreMenu])

  useEffect(() => {
    activeSessionIdRef.current = state.activeSessionId
  }, [state.activeSessionId])

  // Synchronize with external agent approvals/denials from Sidebar or Command Palette
  const termSession = useMemo(() => state.terminals.find((t) => t.id === id), [state.terminals, id])
  const effectiveAgentStatus = termSession?.agentState?.status ?? agentDetection.status
  const effectivePromptQuestion =
    termSession?.agentState?.promptQuestion !== undefined
      ? termSession.agentState.promptQuestion
      : agentDetection.promptQuestion

  // Global hotkeys for in-pane approval: when this terminal is active & waiting, pressing 'y' approves and 'n' denies
  useEffect(() => {
    if (effectiveAgentStatus !== 'waiting' || state.activeSessionId !== id) return undefined
    const handleKeyDown = (e: KeyboardEvent): void => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName
      if (['INPUT', 'TEXTAREA'].includes(activeTag)) return
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault()
        manualActionTimestampRef.current = Date.now()
        stdoutBufferRef.current = ''
        window.electron.ipcRenderer.send('pty-write', id, 'y\r')
        termInstanceRef.current?.focus()
        setAgentDetection({
          status: 'working',
          promptQuestion: undefined,
          lastActiveAt: Date.now()
        })
        dispatch({
          type: 'UPDATE_TERMINAL_AGENT_STATE',
          id,
          agentState: {
            status: 'working',
            promptQuestion: undefined,
            lastActiveAt: Date.now()
          }
        })
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        manualActionTimestampRef.current = Date.now()
        stdoutBufferRef.current = ''
        window.electron.ipcRenderer.send('pty-write', id, 'n\r')
        termInstanceRef.current?.focus()
        setAgentDetection({
          status: 'idle',
          promptQuestion: undefined,
          lastActiveAt: Date.now()
        })
        dispatch({
          type: 'UPDATE_TERMINAL_AGENT_STATE',
          id,
          agentState: {
            status: 'idle',
            promptQuestion: undefined,
            lastActiveAt: Date.now()
          }
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [effectiveAgentStatus, state.activeSessionId, id, dispatch])

  // Synchronize terminal font zoom across all open panes
  useEffect(() => {
    const handleZoomEvent = (e: Event): void => {
      const detail = (e as CustomEvent<{ delta?: number; reset?: boolean; action?: 'in' | 'out' | 'reset' }>).detail
      setTerminalFontSize((prev) => {
        let next = prev
        if (detail.reset || detail.action === 'reset') {
          next = 13.5
        } else if (detail.action === 'in') {
          next = Math.max(10, Math.min(24, prev + 1))
        } else if (detail.action === 'out') {
          next = Math.max(10, Math.min(24, prev - 1))
        } else if (typeof detail.delta === 'number') {
          next = Math.max(10, Math.min(24, prev + detail.delta))
        }
        localStorage.setItem('nexus-terminal-font-size', next.toString())
        if (termInstanceRef.current) {
          termInstanceRef.current.options.fontSize = next
          fitAddonRef.current?.fit()
        }
        return next
      })
    }
    window.addEventListener('nexus-zoom-terminal', handleZoomEvent)
    return () => window.removeEventListener('nexus-zoom-terminal', handleZoomEvent)
  }, [])

  const activeEnvRef = useRef<Record<string, string>>({})
  const previousAccountsRef = useRef<AIAccount[]>([])
  const [cliAuthInfo, setCliAuthInfo] = useState<Record<string, string>>({})

  // Detect CLI Google account auth status (e.g. bindu2k123@gmail.com)
  useEffect(() => {
    let active = true
    void Promise.all(
      state.aiAccounts.map(async (account) => {
        try {
          const auth = await window.api.getCLIAccountAuth(account)
          return auth.loggedIn && auth.authMethod !== 'profile-detected' && auth.email
            ? ([account.id, auth.email] as const)
            : account.googleEmail
              ? ([account.id, account.googleEmail] as const)
              : null
        } catch {
          return account.googleEmail ? ([account.id, account.googleEmail] as const) : null
        }
      })
    ).then((entries) => {
      if (active) setCliAuthInfo(Object.fromEntries(entries.filter((entry) => entry !== null)))
    })
    return () => {
      active = false
    }
  }, [state.aiAccounts])

  // Keep ordinary shells free of account overrides. When an account is designated,
  // ensure its environment credentials are used.
  const activeEnv = useMemo((): Record<string, string> => {
    if (selectedAccountId && selectedAccountId !== 'all') {
      const acc = state.aiAccounts.find((a) => a.id === selectedAccountId)
      if (acc) {
        return getAccountEnv(acc)
      }
    }
    if (!accountOverride && env && Object.keys(env).length > 0) return env
    if (providerId && providerId !== 'local' && providerId !== 'web') {
      const matchingAcc =
        state.aiAccounts.find(
          (a) =>
            a.isDefault &&
            (a.providerId === providerId ||
              (providerId.startsWith('claude') && a.providerId === 'claude') ||
              (providerId.startsWith('chatgpt') && a.providerId === 'chatgpt') ||
              ((providerId.startsWith('gemini') ||
                providerId.startsWith('agy') ||
                providerId.startsWith('antigravity')) &&
                a.providerId === 'gemini'))
        ) ||
        state.aiAccounts.find(
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
        return getAccountEnv(matchingAcc)
      }
    }
    return {}
  }, [accountOverride, env, selectedAccountId, providerId, state.aiAccounts])

  useEffect(() => {
    activeEnvRef.current = activeEnv
  }, [activeEnv])

  const [gitInfo, setGitInfo] = useState<GitBranchInfo | null>(null)
  const [copiedBranch, setCopiedBranch] = useState(false)
  const [showEnvModal, setShowEnvModal] = useState(false)

  useEffect(() => {
    if (!cwd) return
    let active = true
    const updateGit = async (): Promise<void> => {
      try {
        const info = await window.api.getGitInfo(cwd)
        if (active) setGitInfo(info)
      } catch {
        if (active) setGitInfo(null)
      }
    }
    updateGit()
    const interval = setInterval(updateGit, 8000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [cwd])

  const forceKillAndReset = (): void => {
    setShowMoreMenu(false)
    if (termInstanceRef.current) {
      termInstanceRef.current.write(
        '\r\n\x1b[31;1m⚡ Sending SIGKILL to process group...\x1b[0m\r\n'
      )
    }
    window.api.forceKillTerminal(id)
    setTimeout(() => {
      window.electron.ipcRenderer.send('pty-restart', id, name, cwd, command, activeEnv)
      if (termInstanceRef.current) {
        termInstanceRef.current.write(
          '\x1b[32m✔ Shell reset cleanly with fresh process group\x1b[0m\r\n\r\n'
        )
      }
    }, 250)
  }

  const insertSnippet = (snippet: string, execute = true): void => {
    setShowMoreMenu(false)
    const toSend = execute ? `${snippet}\r` : snippet
    window.electron.ipcRenderer.send('pty-write', id, toSend)
    termInstanceRef.current?.focus()
  }

  const provider = getProvider(providerId)

  // Clipboard paste helper for tokens, text, and screenshots/images
  const pasteFromClipboard = async (andSubmit = false): Promise<void> => {
    try {
      let text = await window.api.readClipboardText().catch(() => '')
      if (!text || !text.trim()) {
        try {
          text = await navigator.clipboard.readText()
        } catch {
          // ignore clipboard read errors
        }
      }

      // If no text, check if clipboard contains an image (screenshot, copied graphic)
      if (!text || !text.trim()) {
        try {
          const imagePath = await window.api.readClipboardImage()
          if (imagePath) {
            const fileName = imagePath.split('/').pop() || 'image.png'
            const toSend = andSubmit ? `"${imagePath}"\r` : `"${imagePath}" `
            window.electron.ipcRenderer.send('pty-write', id, toSend)
            termInstanceRef.current?.focus()
            setPasteFeedback({ text: `Pasted Image (${fileName}) 🖼️`, success: true })
            setTimeout(() => setPasteFeedback(null), 2000)
            return
          }
        } catch {
          // ignore image paste error
        }

        setPasteFeedback({ text: 'Empty', success: false })
        setTimeout(() => setPasteFeedback(null), 1500)
        return
      }

      // Normalize multiline cURL and raw shell newlines for Unix PTY execution
      let textToSend = text
      if (text.includes('curl ') && text.includes('\\')) {
        textToSend = text.replace(/\\\r?\n\s*/g, ' ')
      } else {
        textToSend = text.replace(/\r?\n/g, '\r')
      }

      if (andSubmit) {
        textToSend = `${textToSend.trim()}\r`
      }

      window.electron.ipcRenderer.send('pty-write', id, textToSend)
      termInstanceRef.current?.focus()

      const charCount = text.length
      setPasteFeedback({
        text: andSubmit ? 'Sent ↵' : `Pasted (${charCount}c)`,
        success: true
      })
      setTimeout(() => setPasteFeedback(null), 1500)
    } catch {
      setPasteFeedback({ text: 'Error', success: false })
      setTimeout(() => setPasteFeedback(null), 1500)
    }
  }

  const sendEnter = (): void => {
    window.electron.ipcRenderer.send('pty-write', id, '\r')
    termInstanceRef.current?.focus()
  }

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (splitMenuRef.current && !splitMenuRef.current.contains(e.target as Node)) {
        setShowSplitMenu(null)
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setShowAccountMenu(false)
      }
      if (localhostMenuRef.current && !localhostMenuRef.current.contains(e.target as Node)) {
        setShowLocalhostMenu(false)
      }
      if (resizeMenuRef.current && !resizeMenuRef.current.contains(e.target as Node)) {
        setShowResizeMenu(false)
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    if (showSplitMenu || showAccountMenu || showLocalhostMenu || showResizeMenu || contextMenu) {
      window.addEventListener('mousedown', handleClickOutside)
    }
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [showSplitMenu, showAccountMenu, showLocalhostMenu, showResizeMenu, contextMenu])

  // Out-of-band low-token handoff engine
  const performLeanHandoffAndSwitch = async (targetAccountId?: string): Promise<void> => {
    setIsHandoffRunning(true)
    try {
      const currentAcc = state.aiAccounts.find((a) => a.id === selectedAccountId)
      // 1. Capture git diff and status out-of-band in main process (bypassing frozen/paused PTY)
      const handoff = await window.api.generateHandoffState(
        cwd || '~',
        currentAcc?.name || 'Primary Agent',
        'Session paused due to rate limit. Resuming task without replaying chat history.'
      )
      if (!handoff.success)
        throw new Error('Could not save the handoff file. Check folder permissions and try again.')

      // 2. Select next available account of same provider (or another owned account)
      let nextAccount = state.aiAccounts.find((a) => a.id === targetAccountId)
      if (!nextAccount) {
        nextAccount =
          state.aiAccounts.find(
            (a) =>
              a.id !== selectedAccountId && (!currentAcc || a.providerId === currentAcc.providerId)
          ) || state.aiAccounts.find((a) => a.id !== selectedAccountId)
      }

      if (nextAccount) {
        selectAccount(nextAccount.id)
      }

      // The CLI can take an arbitrary time to authenticate. Copy the prompt for
      // a deliberate paste once the new session is ready rather than racing it.
      await window.api.writeClipboardText(handoff.prompt)
      setHandoffStatus(
        `Handoff saved to ${handoff.handoffPath}. Resume prompt copied to clipboard.`
      )
      setRateLimitPaused(null)
    } catch (err) {
      console.error('Handoff error:', err)
      setTerminalError(err instanceof Error ? err.message : 'Handoff failed')
    } finally {
      setIsHandoffRunning(false)
    }
  }

  // Apply profile changes on an explicit restart so a running command is never interrupted.
  useEffect(() => {
    const prev = previousAccountsRef.current
    previousAccountsRef.current = state.aiAccounts
    if (!prev.length || selectedAccountId === 'all') return
    const currentAccount = state.aiAccounts.find((acc) => acc.id === selectedAccountId)
    const previousAccount = prev.find((acc) => acc.id === selectedAccountId)
    if (
      JSON.stringify(getAccountEnv(currentAccount)) !==
      JSON.stringify(getAccountEnv(previousAccount))
    ) {
      setTerminalError('Account profile changed. Restart this terminal to apply the new profile.')
    }
  }, [state.aiAccounts, selectedAccountId])

  useEffect(() => {
    if (!terminalRef.current) return

    const initialWidth = terminalRef.current.clientWidth || 600
    let initialFontSize = terminalFontSize
    if (initialWidth < 450) initialFontSize = Math.min(terminalFontSize, 10)
    else if (initialWidth < 560) initialFontSize = Math.min(terminalFontSize, 11)
    else if (initialWidth < 660) initialFontSize = Math.min(terminalFontSize, 12)

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily:
        "'JetBrains Mono', 'SF Mono', Menlo, Monaco, 'Cascadia Code', 'Fira Code', ui-monospace, monospace",
      fontSize: initialFontSize,
      lineHeight: 1.4,
      letterSpacing: 0.3,
      theme: {
        background: '#101114',
        foreground: '#f0f6fc',
        cursor: '#8baeff',
        cursorAccent: '#101114',
        selectionBackground: 'rgba(117, 157, 255, 0.35)',
        black: '#1f242c',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#ffffff'
      }
    })
    termInstanceRef.current = term

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    term.loadAddon(fitAddon)

    // Intercept keyboard shortcuts: Cmd+V / Ctrl+V paste, Cmd+C copy, Cmd+A select all, Cmd+/Cmd- zoom
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.type === 'keydown') {
        // Zoom In: Cmd + / Cmd =
        if ((event.metaKey || event.ctrlKey) && (event.key === '=' || event.key === '+')) {
          window.dispatchEvent(new CustomEvent('nexus-zoom-terminal', { detail: { delta: 1 } }))
          return false
        }
        // Zoom Out: Cmd -
        if ((event.metaKey || event.ctrlKey) && event.key === '-') {
          window.dispatchEvent(new CustomEvent('nexus-zoom-terminal', { detail: { delta: -1 } }))
          return false
        }
        // Zoom Reset: Cmd 0
        if ((event.metaKey || event.ctrlKey) && event.key === '0') {
          window.dispatchEvent(new CustomEvent('nexus-zoom-terminal', { detail: { reset: true } }))
          return false
        }
        // Paste: Cmd+V / Ctrl+V
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
          void pasteFromClipboard(false)
          return false
        }
        // Copy: Cmd+C / Ctrl+C when selection exists
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
          if (term.hasSelection()) {
            const selectedText = term.getSelection()
            window.api.writeClipboardText(selectedText).catch(() => {})
            return false
          }
          return true // allow normal SIGINT when no text is selected
        }
        // Select All: Cmd+A
        if (event.metaKey && event.key.toLowerCase() === 'a') {
          term.selectAll()
          return false
        }
      }
      return true
    })

    term.open(terminalRef.current)

    // Click anywhere in terminal container to focus xterm
    const termContainer = terminalRef.current
    const focusTerminal = (): void => {
      term.focus()
      dispatch({ type: 'SET_ACTIVE_SESSION', id })
    }
    termContainer.addEventListener('click', focusTerminal)
    termContainer.addEventListener('mousedown', focusTerminal)
    const onPaste = async (e: ClipboardEvent): Promise<void> => {
      e.preventDefault()
      // Check for pasted image files/blobs in clipboard items
      const items = e.clipboardData?.items
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const file = items[i].getAsFile()
            if (file) {
              try {
                const arrayBuf = await file.arrayBuffer()
                const savedPath = await window.api.saveClipboardImageBuffer(new Uint8Array(arrayBuf))
                if (savedPath) {
                  const fileName = savedPath.split('/').pop() || 'image.png'
                  window.electron.ipcRenderer.send('pty-write', id, `"${savedPath}" `)
                  term.focus()
                  setPasteFeedback({ text: `Pasted Image (${fileName}) 🖼️`, success: true })
                  setTimeout(() => setPasteFeedback(null), 2000)
                  return
                }
              } catch {
                // fall through to text paste
              }
            }
          }
        }
      }

      const text = e.clipboardData?.getData('text/plain')
      if (text && text.trim()) {
        const textToSend =
          text.includes('curl ') && text.includes('\\')
            ? text.replace(/\\\r?\n\s*/g, ' ')
            : text.replace(/\r?\n/g, '\r')
        window.electron.ipcRenderer.send('pty-write', id, textToSend)
        setPasteFeedback({ text: `Pasted (${text.length}c)`, success: true })
        setTimeout(() => setPasteFeedback(null), 1500)
      } else {
        void pasteFromClipboard(false)
      }
    }
    termContainer.addEventListener('paste', onPaste)
    if (term.textarea) {
      term.textarea.addEventListener('focus', () => {
        dispatch({ type: 'SET_ACTIVE_SESSION', id })
      })
    }

    // Slight delay for layout transitions before fitting & spawning
    const timer = setTimeout(() => {
      if (terminalRef.current && terminalRef.current.clientWidth) {
        const width = terminalRef.current.clientWidth
        if (width < 450) term.options.fontSize = Math.min(terminalFontSize, 10)
        else if (width < 560) term.options.fontSize = Math.min(terminalFontSize, 11)
        else if (width < 660) term.options.fontSize = Math.min(terminalFontSize, 12)
      }
      fitAddon.fit()
      term.focus()
      window.electron.ipcRenderer.send('pty-create', id, name, cwd, command, activeEnvRef.current)
      if (Object.keys(activeEnvRef.current).length > 0) {
        const profileDir =
          activeEnvRef.current.ANTIGRAVITY_APP_DATA_DIR ||
          activeEnvRef.current.CLAUDE_CONFIG_DIR ||
          activeEnvRef.current.CODEX_HOME ||
          ''
        term.write(
          `\x1b[36m⚡ [AI Credentials Active]: ${Object.keys(activeEnvRef.current).join(', ')}${profileDir ? ` (${profileDir})` : ''}\x1b[0m\r\n`
        )
      }
    }, 120)

    term.onData((data) => {
      window.electron.ipcRenderer.send('pty-write', id, data)
    })

    const onDataHandler = (_: unknown, data: string): void => {
      term.write(data)
      const cleanData = stripAnsi(data)
      const rateLimitRegex =
        /rate limit reached|hit usage limit|resets in|resets at|429 too many requests|quota exceeded|you've hit the limit|usage limit exceeded/i
      if (rateLimitRegex.test(cleanData)) {
        setRateLimitPaused({
          message: cleanData.trim().slice(0, 150),
          detectedAt: Date.now()
        })
      }
      const localhostMatch = cleanData.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})/i)
      if (localhostMatch) {
        setDetectedLocalhostUrl(localhostMatch[0])
      }

      // Herdr-style Agent State Detection (debounced to eliminate React render storms)
      stdoutBufferRef.current = (stdoutBufferRef.current + data).slice(-5000)

      if (detectionDebounceTimerRef.current) {
        clearTimeout(detectionDebounceTimerRef.current)
      }
      detectionDebounceTimerRef.current = setTimeout(() => {
        // Skip re-detection during cooldown after manual approval or deny
        if (Date.now() - manualActionTimestampRef.current < 2500) {
          return
        }

        const detected = detectAgentState(
          stdoutBufferRef.current,
          lastReportedStatusRef.current as AgentStatus
        )
        const hasChanged =
          detected.status !== lastReportedStatusRef.current ||
          (detected.status === 'waiting' &&
            detected.promptQuestion !== agentDetection.promptQuestion)

        if (hasChanged) {
          lastReportedStatusRef.current = detected.status
          setAgentDetection(detected)
          dispatch({
            type: 'UPDATE_TERMINAL_AGENT_STATE',
            id,
            agentState: detected
          })

          // Send desktop notification when agent enters waiting or done state
          if (
            (detected.status === 'waiting' || detected.status === 'done') &&
            lastNotifiedStatusRef.current !== detected.status
          ) {
            lastNotifiedStatusRef.current = detected.status
            const isCurrentPaneFocused =
              activeSessionIdRef.current === id && document.hasFocus() && !document.hidden
            if (!isCurrentPaneFocused) {
              const matchedAcc = state.aiAccounts.find(
                (a) => a.id === accountId || a.providerId === providerId
              )
              const subLabel =
                providerId === 'claude'
                  ? '[Claude Pro]'
                  : providerId === 'chatgpt'
                    ? '[ChatGPT Plus]'
                    : providerId === 'gemini'
                      ? '[Gemini Advanced]'
                      : matchedAcc
                        ? `[${matchedAcc.name}]`
                        : '[AI Agent]'
              const title =
                detected.status === 'waiting'
                  ? `${subLabel} Permission Needed: ${name}`
                  : `${subLabel} Finished: ${name}`
              const body =
                detected.status === 'waiting'
                  ? detected.promptQuestion || 'An agent command requires confirmation'
                  : 'Task execution completed'
              void window.api.sendDesktopNotification({ title, body, paneId: id }).catch(() => {})
            }
          } else if (detected.status === 'working') {
            lastNotifiedStatusRef.current = 'working'
          }
        }
      }, 120)
    }

    const onHistoryHandler = (_: unknown, historyData: string): void => {
      if (typeof historyData === 'string' && historyData.length > 0) {
        term.write(historyData)
        stdoutBufferRef.current = historyData.slice(-5000)
        const detected = detectAgentState(stdoutBufferRef.current)
        lastReportedStatusRef.current = detected.status
        setAgentDetection(detected)
        dispatch({
          type: 'UPDATE_TERMINAL_AGENT_STATE',
          id,
          agentState: detected
        })
      }
    }
    window.electron.ipcRenderer.once(`pty-history-${id}`, onHistoryHandler)
    window.api.requestTerminalHistory(id)

    window.electron.ipcRenderer.on(`pty-out-${id}`, onDataHandler)
    const onErrorHandler = (_: unknown, message: string): void => setTerminalError(message)
    const onExitHandler = (_: unknown, result: number | { exitCode?: number }): void => {
      const exitCode = typeof result === 'number' ? result : result?.exitCode
      setTerminalError(
        `Shell exited${typeof exitCode === 'number' ? ` (${exitCode})` : ''}. Restart this session to continue.`
      )
    }
    window.electron.ipcRenderer.on(`pty-error-${id}`, onErrorHandler)
    window.electron.ipcRenderer.on(`pty-exit-${id}`, onExitHandler)

    let resizeRaf: number | null = null
    let lastCols = 0
    let lastRows = 0
    const handleResize = (): void => {
      if (resizeRaf !== null) cancelAnimationFrame(resizeRaf)
      resizeRaf = requestAnimationFrame(() => {
        try {
          if (!terminalRef.current || !terminalRef.current.clientWidth || !terminalRef.current.clientHeight) return
          const width = terminalRef.current.clientWidth
          // Auto-adjust font size in narrow split panes so interactive TUIs (like Gemini/Antigravity CLI)
          // maintain at least ~70 columns without garbled line wraps or broken status bars.
          let targetFontSize = terminalFontSize
          if (width < 450) {
            targetFontSize = Math.min(terminalFontSize, 10)
          } else if (width < 560) {
            targetFontSize = Math.min(terminalFontSize, 11)
          } else if (width < 660) {
            targetFontSize = Math.min(terminalFontSize, 12)
          }
          if (term.options.fontSize !== targetFontSize) {
            term.options.fontSize = targetFontSize
          }
          fitAddon.fit()
          if (term.cols !== lastCols || term.rows !== lastRows) {
            lastCols = term.cols
            lastRows = term.rows
            window.electron.ipcRenderer.send('pty-resize', id, term.cols, term.rows)
          }
        } catch {
          /* ignore fit errors on unmounted containers */
        }
      })
    }

    window.addEventListener('resize', handleResize)

    const observer = new ResizeObserver(() => {
      handleResize()
    })
    observer.observe(terminalRef.current)

    return () => {
      if (resizeRaf !== null) cancelAnimationFrame(resizeRaf)
      clearTimeout(timer)
      if (detectionDebounceTimerRef.current) {
        clearTimeout(detectionDebounceTimerRef.current)
      }
      termContainer.removeEventListener('click', focusTerminal)
      termContainer.removeEventListener('mousedown', focusTerminal)
      termContainer.removeEventListener('paste', onPaste)
      window.electron.ipcRenderer.removeAllListeners(`pty-out-${id}`)
      window.electron.ipcRenderer.removeAllListeners(`pty-error-${id}`)
      window.electron.ipcRenderer.removeAllListeners(`pty-exit-${id}`)
      window.electron.ipcRenderer.removeAllListeners(`pty-history-${id}`)
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
      try {
        fitAddon.dispose()
      } catch {
        /* ignore */
      }
      try {
        term.dispose()
      } catch {
        /* ignore */
      }
      termInstanceRef.current = null
      fitAddonRef.current = null
    }
  }, [id, name, cwd, command])

  // Auto-reconnect terminal when system wakes from sleep or screen unlocks
  useEffect(() => {
    if (!window.api.onSystemResume) return
    const unsubscribe = window.api.onSystemResume(() => {
      const term = termInstanceRef.current
      if (!term) return
      // Brief delay lets PTY process re-settle after wake
      setTimeout(() => {
        try {
          term.write('\r\n\x1b[33m⚡ System woke — reconnecting terminal…\x1b[0m\r\n')
          window.electron.ipcRenderer.send('pty-reconnect', id)
        } catch {
          /* ignore */
        }
      }, 800)
    })
    return unsubscribe
  }, [id])

  const handleClose = (): void => {
    window.electron.ipcRenderer.send('pty-kill', id)
    onClose()
  }

  const restartTerminal = (): void => {
    setTerminalError(null)
    if (termInstanceRef.current) {
      termInstanceRef.current.clear()
      termInstanceRef.current.write('\x1b[33mRestarting terminal session...\x1b[0m\r\n')
    }
    window.electron.ipcRenderer.send('pty-restart', id, name, cwd, command, activeEnv)
    if (Object.keys(activeEnv).length > 0) {
      termInstanceRef.current?.write(
        `\x1b[36m⚡ [AI Credentials Active]: ${Object.keys(activeEnv).join(', ')}\x1b[0m\r\n`
      )
    }
  }

  const selectAccount = (accId: string | 'all', launchCommand?: string): void => {
    setAccountOverride(true)
    setSelectedAccountId(accId)
    setShowAccountMenu(false)
    let newEnv: Record<string, string> = {}
    let label = ''

    if (accId === 'all') {
      label = 'System shell'
    } else {
      const acc = state.aiAccounts.find((a) => a.id === accId)
      if (acc) {
        newEnv = getAccountEnv(acc)
        label = acc.name
      }
    }

    activeEnvRef.current = { ...newEnv }

    let commandToRun = launchCommand !== undefined ? launchCommand : command
    if (accId !== 'all' && launchCommand === undefined) {
      const acc = state.aiAccounts.find((a) => a.id === accId)
      if (acc && command) {
        if (command.includes('login')) {
          commandToRun = getProviderCliLoginCommand(acc.providerId, acc)
        } else {
          commandToRun = getProviderCliCommand(acc.providerId, acc)
        }
      }
    }

    // Cleanly restart the terminal session with the newly selected account's credentials!
    if (termInstanceRef.current) {
      termInstanceRef.current.clear()
      termInstanceRef.current.write(`\r\n\x1b[33m🔄 [Account Switched] Active: ${label}\x1b[0m\r\n`)
      const profileDir =
        newEnv.ANTIGRAVITY_APP_DATA_DIR ||
        newEnv.CLAUDE_CONFIG_DIR ||
        newEnv.CODEX_HOME ||
        'Default'
      termInstanceRef.current.write(
        `\x1b[32m✔ Spawning shell with isolated profile: ${label} (${profileDir})\x1b[0m\r\n\r\n`
      )
    }

    const targetProviderId =
      accId !== 'all'
        ? state.aiAccounts.find((a) => a.id === accId)?.providerId || providerId
        : 'local'

    onAccountChange?.(accId === 'all' ? undefined : accId, targetProviderId, newEnv)
    dispatch({
      type: 'UPDATE_TERMINAL_ACCOUNT',
      id,
      accountId: accId === 'all' ? undefined : accId,
      providerId: targetProviderId,
      env: newEnv
    })

    window.electron.ipcRenderer.send('pty-restart', id, name, cwd, commandToRun, newEnv)
  }

  const isActive = state.activeSessionId === id

  return (
    <div
      onMouseDown={() => {
        dispatch({ type: 'SET_ACTIVE_SESSION', id })
      }}
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#101114',
        borderRadius: '10px',
        overflow: 'hidden',
        border:
          effectiveAgentStatus === 'waiting'
            ? '1px solid #efbc69'
            : isActive
              ? '1px solid #8baeff'
              : effectiveAgentStatus === 'working'
                ? '1px solid rgba(139, 174, 255, 0.45)'
                : '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow:
          effectiveAgentStatus === 'waiting'
            ? '0 0 0 1px #efbc69, 0 0 18px rgba(239, 188, 105, 0.35)'
            : isActive
              ? '0 0 0 1px #8baeff, 0 0 16px rgba(139, 174, 255, 0.28)'
              : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s'
      }}
    >
      {/* Pane Header */}
      <div
        className="drag-handle terminal-pane-header"
        style={{
          backgroundColor: 'rgba(255,255,255,0.03)',
          color: 'white',
          padding: '6px 10px',
          fontSize: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'grab',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          fontFamily: 'system-ui, sans-serif',
          userSelect: 'none'
        }}
      >
        <div
          className={showAccountMenu ? 'terminal-header-menu-open' : undefined}
          style={{
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
            minWidth: 0,
            flex: 1,
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              flexShrink: 0,
              backgroundColor:
                effectiveAgentStatus === 'waiting'
                  ? '#efbc69'
                  : effectiveAgentStatus === 'working'
                    ? '#6dd9b7'
                    : command
                      ? '#4caf50'
                      : '#8baeff',
              boxShadow:
                effectiveAgentStatus === 'waiting'
                  ? '0 0 10px #efbc69'
                  : effectiveAgentStatus === 'working'
                    ? '0 0 10px #6dd9b7'
                    : command
                      ? '0 0 8px rgba(76,175,80,0.6)'
                      : '0 0 8px rgba(117,157,255,0.6)'
            }}
            title={
              effectiveAgentStatus === 'waiting'
                ? 'Blocked on input'
                : effectiveAgentStatus === 'working'
                  ? 'Working...'
                  : effectiveAgentStatus === 'done'
                    ? 'Done'
                    : 'Idle'
            }
          />
          {isEditingName ? (
            <input
              type="text"
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                setIsEditingName(false)
                if (nameDraft.trim() && nameDraft.trim() !== name) {
                  onRename?.(nameDraft.trim())
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setIsEditingName(false)
                  if (nameDraft.trim() && nameDraft.trim() !== name) {
                    onRename?.(nameDraft.trim())
                  }
                } else if (e.key === 'Escape') {
                  setIsEditingName(false)
                  setNameDraft(name)
                }
              }}
              style={{
                fontSize: '12px',
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid #8baeff',
                color: '#fff',
                outline: 'none',
                width: '120px'
              }}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                maxWidth: '140px',
                cursor: 'pointer'
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                setIsEditingName(true)
                setNameDraft(name)
              }}
              title="Double-click to rename session"
            >
              <span
                style={{
                  fontWeight: 600,
                  letterSpacing: '0.4px',
                  fontSize: '12px',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden'
                }}
              >
                {name}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsEditingName(true)
                  setNameDraft(name)
                }}
                title="Rename session"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#666',
                  cursor: 'pointer',
                  padding: '1px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = '#8baeff')}
                onMouseOut={(e) => (e.currentTarget.style.color = '#666')}
              >
                <Edit2 size={10} />
              </button>
            </div>
          )}
          {command && (
            <span
              style={{
                fontSize: '10px',
                padding: '1px 5px',
                backgroundColor: 'rgba(76,175,80,0.15)',
                color: '#81c784',
                borderRadius: '4px',
                fontFamily: 'monospace',
                flexShrink: 0
              }}
            >
              {command}
            </span>
          )}

          {/* AI Credentials Selector & Active Badge */}
          <div style={{ position: 'relative', flexShrink: 0 }} ref={accountMenuRef}>
            <button
              className="profile-selector"
              onClick={() => setShowAccountMenu(!showAccountMenu)}
              aria-expanded={showAccountMenu}
              aria-haspopup="menu"
              title={
                selectedAccountId === 'all'
                  ? 'System shell without a Nexus account override'
                  : (() => {
                      const acc = state.aiAccounts.find((a) => a.id === selectedAccountId)
                      if (!acc) return 'Select Account'
                      const email = cliAuthInfo[acc.id] || acc.googleEmail
                      return `${acc.name}${email ? ` (${email})` : ''} · Directory: ${acc.cliConfigDir || 'Default'}`
                    })()
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 9px',
                borderRadius: '5px',
                border:
                  selectedAccountId !== 'all'
                    ? '1px solid rgba(117, 157, 255, 0.35)'
                    : '1px solid rgba(255, 255, 255, 0.12)',
                backgroundColor:
                  selectedAccountId !== 'all'
                    ? 'rgba(117, 157, 255, 0.1)'
                    : 'rgba(255, 255, 255, 0.04)',
                color: selectedAccountId !== 'all' ? '#8baeff' : '#ccc',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = '#8baeff'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor =
                  selectedAccountId !== 'all'
                    ? 'rgba(117, 157, 255, 0.35)'
                    : 'rgba(255, 255, 255, 0.12)'
              }}
            >
              <Sparkles size={11} color={selectedAccountId !== 'all' ? '#8baeff' : '#888'} />
              <span
                style={{
                  maxWidth: '220px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                  verticalAlign: 'middle'
                }}
              >
                {selectedAccountId === 'all'
                  ? 'System shell'
                  : (() => {
                      const acc = state.aiAccounts.find((a) => a.id === selectedAccountId)
                      if (!acc) return 'Account'
                      const icon =
                        acc.providerId === 'claude'
                          ? '🧠'
                          : acc.providerId === 'chatgpt'
                            ? '🤖'
                            : acc.providerId === 'gemini'
                              ? '💎'
                              : '🦁'
                      return `${icon} ${acc.name}`
                    })()}
              </span>
              <ChevronDown size={10} />
            </button>

            {showAccountMenu && (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  backgroundColor: '#18181f',
                  border: '1px solid rgba(117, 157, 255, 0.4)',
                  borderRadius: '8px',
                  padding: '6px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.85)',
                  zIndex: 1000,
                  minWidth: '280px',
                  maxHeight: 'min(300px, 42vh)',
                  overflowY: 'auto'
                }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    color: '#888',
                    padding: '4px 8px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}
                >
                  Active AI Account & Profile
                </div>

                <button
                  onClick={() => selectAccount('all')}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    background:
                      selectedAccountId === 'all' ? 'rgba(117,157,255,0.12)' : 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#eee',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      selectedAccountId === 'all' ? 'rgba(117,157,255,0.12)' : 'transparent')
                  }
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🌐</span>
                    <span>System shell</span>
                  </span>
                  {selectedAccountId === 'all' && <Check size={12} color="#8baeff" />}
                </button>

                {state.aiAccounts.map((acc) => {
                  const icon =
                    acc.providerId === 'claude'
                      ? '🧠'
                      : acc.providerId === 'chatgpt'
                        ? '🤖'
                        : acc.providerId === 'gemini'
                          ? '💎'
                          : '🦁'
                  const isSelected = selectedAccountId === acc.id
                  const email = cliAuthInfo[acc.id] || acc.googleEmail
                  return (
                    <button
                      key={acc.id}
                      onClick={() => selectAccount(acc.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        background: isSelected ? 'rgba(117,157,255,0.12)' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#eee',
                        fontSize: '11px',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                      onMouseOver={(e) =>
                        (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                      }
                      onMouseOut={(e) =>
                        (e.currentTarget.style.backgroundColor = isSelected
                          ? 'rgba(117,157,255,0.12)'
                          : 'transparent')
                      }
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{icon}</span>
                          <span style={{ fontWeight: isSelected ? 600 : 400 }}>{acc.name}</span>
                          <SubscriptionBadge type={acc.usage?.tier} />
                        </span>
                        {email && (
                          <span
                            style={{
                              fontSize: '10px',
                              color: '#4caf50',
                              paddingLeft: '22px'
                            }}
                          >
                            Logged In: {email}
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: '9px',
                          color: isSelected ? '#8baeff' : email ? '#4caf50' : '#888',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {isSelected ? (
                          <span style={{ color: '#8baeff', fontWeight: 600 }}>Active ✓</span>
                        ) : (
                          <span style={{ color: '#aaa', fontSize: '9px' }}>Switch ↵</span>
                        )}
                        <span
                          style={{
                            fontSize: '8px',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            backgroundColor: 'rgba(117,157,255,0.1)',
                            color: '#8baeff'
                          }}
                        >
                          {email ? 'Logged In' : 'Native Auth'}
                        </span>
                      </span>
                    </button>
                  )
                })}

                <div
                  style={{
                    height: '1px',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    margin: '4px 0'
                  }}
                />

                <div
                  style={{
                    fontSize: '9px',
                    color: '#a3afbd',
                    padding: '3px 8px',
                    textTransform: 'uppercase',
                    fontWeight: 600
                  }}
                >
                  Quick Native CLI Login
                </div>

                {state.aiAccounts.map((acc) => {
                  const cmd = getProviderCliLoginCommand(acc.providerId, acc)
                  if (!cmd) return null
                  return (
                    <button
                      key={`login-${acc.id}`}
                      onClick={() => {
                        setShowAccountMenu(false)
                        selectAccount(acc.id, cmd)
                      }}
                      style={{
                        width: '100%',
                        padding: '5px 8px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#8baeff',
                        fontSize: '11px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                      onMouseOver={(e) =>
                        (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                      }
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <TermIcon size={12} /> {acc.name}: {cmd}
                    </button>
                  )
                })}

                <div
                  style={{
                    height: '1px',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    margin: '4px 0'
                  }}
                />

                <button
                  onClick={() => {
                    setShowAccountMenu(false)
                    dispatch({ type: 'SET_SHOW_SETTINGS', show: true })
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#8baeff',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontWeight: 500
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'rgba(117,157,255,0.1)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  ⚙️ Manage Accounts & Profiles in Settings...
                </button>
              </div>
            )}
          </div>

          {/* CWD Path Badge with 1-click copy */}
          {cwd && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                navigator.clipboard.writeText(cwd)
                setCopiedPath(true)
                setTimeout(() => setCopiedPath(false), 1500)
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                color: copiedPath ? '#10b981' : '#94a3b8',
                fontSize: '10.5px',
                cursor: 'pointer',
                maxWidth: '180px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
              title={`Working Directory: ${cwd} (Click to copy)`}
            >
              {copiedPath ? <Check size={10} color="#10b981" /> : <Copy size={10} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cwd.replace(/^\/Users\/[^/]+/, '~')}
              </span>
            </button>
          )}

          {/* Git Branch & Status Badge */}
          {gitInfo?.isGit && gitInfo.branch && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (gitInfo.branch) {
                  navigator.clipboard.writeText(gitInfo.branch)
                  setCopiedBranch(true)
                  setTimeout(() => setCopiedBranch(false), 1500)
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 6px',
                borderRadius: '4px',
                border: gitInfo.dirty
                  ? '1px solid rgba(245, 158, 11, 0.3)'
                  : '1px solid rgba(16, 185, 129, 0.25)',
                backgroundColor: gitInfo.dirty
                  ? 'rgba(245, 158, 11, 0.08)'
                  : 'rgba(16, 185, 129, 0.08)',
                color: copiedBranch ? '#10b981' : gitInfo.dirty ? '#fbbf24' : '#34d399',
                fontSize: '10.5px',
                cursor: 'pointer',
                maxWidth: '160px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: 500,
                transition: 'all 0.15s ease'
              }}
              title={`Git Branch: ${gitInfo.branch}${gitInfo.dirty ? ` (${gitInfo.modifiedCount} modified)` : ' (clean)'} — Click to copy branch name`}
            >
              <GitBranch size={10} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {gitInfo.branch}
              </span>
              {gitInfo.dirty && (
                <span
                  style={{
                    fontSize: '9px',
                    backgroundColor: 'rgba(245, 158, 11, 0.2)',
                    borderRadius: '8px',
                    padding: '0 4px',
                    fontWeight: 700
                  }}
                >
                  ● {gitInfo.modifiedCount}
                </span>
              )}
            </button>
          )}

          {/* Paste feedback pill */}
          {pasteFeedback && (
            <span
              style={{
                fontSize: '10px',
                color: pasteFeedback.success ? '#10b981' : '#f87171',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontWeight: 600
              }}
            >
              {pasteFeedback.text}
            </span>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            gap: '4px',
            alignItems: 'center',
            flexShrink: 0,
            position: 'relative'
          }}
          ref={splitMenuRef}
        >
          {/* Inter-terminal Speak toggle */}
          <button
            type="button"
            onClick={() => setShowSpeakDock(!showSpeakDock)}
            title="Speak to another terminal session"
            style={{
              background: showSpeakDock ? 'rgba(117,157,255,0.25)' : 'rgba(255,255,255,0.04)',
              border: showSpeakDock
                ? '1px solid rgba(117,157,255,0.45)'
                : '1px solid rgba(255,255,255,0.1)',
              color: showSpeakDock ? '#8baeff' : '#aaa',
              cursor: 'pointer',
              borderRadius: '4px',
              padding: '2px 6px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexShrink: 0,
              fontSize: '10.5px',
              transition: 'all 0.15s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = '#fff'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
            }}
            onMouseOut={(e) => {
              if (!showSpeakDock) {
                e.currentTarget.style.color = '#aaa'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
              }
            }}
          >
            <MessageSquareQuote size={12} />
            <span>Speak</span>
          </button>

          {/* Consolidated Actions Dropdown (Actions ▾) */}
          <div style={{ position: 'relative' }} ref={moreMenuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowMoreMenu(!showMoreMenu)
              }}
              title="Terminal actions, snippets, and tools"
              aria-label="Actions"
              style={{
                background: showMoreMenu ? 'rgba(117,157,255,0.2)' : 'rgba(255,255,255,0.04)',
                border: showMoreMenu
                  ? '1px solid rgba(117,157,255,0.4)'
                  : '1px solid rgba(255,255,255,0.1)',
                color: showMoreMenu ? '#8baeff' : '#aaa',
                cursor: 'pointer',
                borderRadius: '4px',
                padding: '2px 6px',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                flexShrink: 0,
                fontSize: '10.5px',
                transition: 'all 0.15s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.color = '#fff'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
              }}
              onMouseOut={(e) => {
                if (!showMoreMenu) {
                  e.currentTarget.style.color = '#aaa'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                }
              }}
            >
              <MoreHorizontal size={12} />
              <span>Actions</span>
              <ChevronDown size={9} />
            </button>

            {showMoreMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  backgroundColor: '#161922',
                  border: '1px solid rgba(117, 157, 255, 0.35)',
                  borderRadius: '8px',
                  padding: '6px',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.85)',
                  zIndex: 2000,
                  minWidth: '220px',
                  maxHeight: '480px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}
              >
                {/* Section: Session Control */}
                <div
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    color: '#8baeff',
                    textTransform: 'uppercase',
                    padding: '3px 8px'
                  }}
                >
                  Session & Process
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false)
                    setIsEditingName(true)
                    setNameDraft(name)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '5px 8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#eee',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Edit2 size={11} color="#8baeff" /> Rename Session...
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false)
                    setShowSpeakDock(true)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '5px 8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#eee',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <MessageSquareQuote size={11} color="#8baeff" /> Speak to Session...
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false)
                    restartTerminal()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '5px 8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#eee',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <RotateCw size={11} color="#8baeff" /> Restart Terminal Session
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false)
                    forceKillAndReset()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '5px 8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#f87171',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.12)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Zap size={11} color="#f87171" /> Force Kill (kill -9) & Reset Shell
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false)
                    termInstanceRef.current?.clear()
                    window.electron.ipcRenderer.send('pty-write', id, 'clear\r')
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '5px 8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#eee',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <RotateCw size={11} color="#ff9aa4" /> Clear Terminal (⌘K)
                </button>

                <div
                  style={{
                    height: '1px',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    margin: '4px 0'
                  }}
                />

                {/* Section: Quick Dev Snippets */}
                <div
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    color: '#8baeff',
                    textTransform: 'uppercase',
                    padding: '3px 8px'
                  }}
                >
                  Quick Dev Snippets
                </div>
                {[
                  { label: 'git status', cmd: 'git status' },
                  { label: 'git diff', cmd: 'git diff' },
                  { label: 'git log -n 5 --oneline', cmd: 'git log -n 5 --oneline' },
                  { label: 'npm run dev', cmd: 'npm run dev' },
                  { label: 'npm test', cmd: 'npm test' },
                  { label: 'npm run build', cmd: 'npm run build' },
                  { label: 'lsof -i :3000', cmd: 'lsof -i :3000' }
                ].map((snip) => (
                  <button
                    key={snip.cmd}
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false)
                      insertSnippet(snip.cmd)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#ddd',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                    }
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span>{snip.label}</span>
                    <span style={{ fontSize: '9px', color: '#666' }}>↵</span>
                  </button>
                ))}

                <div
                  style={{
                    height: '1px',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    margin: '4px 0'
                  }}
                />

                {/* Section: Clipboard & Input */}
                <div
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    color: '#8baeff',
                    textTransform: 'uppercase',
                    padding: '3px 8px'
                  }}
                >
                  Clipboard & Input
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false)
                    sendEnter()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '5px 8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#eee',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <CornerDownLeft size={11} color="#8baeff" /> Send Enter Key (↵)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false)
                    pasteFromClipboard(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '5px 8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#eee',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Clipboard size={11} color="#8baeff" /> Paste Clipboard (⌘V)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false)
                    pasteFromClipboard(true)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '5px 8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#eee',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <CornerDownLeft size={11} color="#10b981" /> Paste & Submit (↵)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false)
                    if (termInstanceRef.current) {
                      termInstanceRef.current.selectAll()
                      const text = termInstanceRef.current.getSelection()
                      navigator.clipboard.writeText(text)
                      termInstanceRef.current.clearSelection()
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '5px 8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#eee',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Copy size={11} color="#8baeff" /> Copy All Output
                </button>

                <div
                  style={{
                    height: '1px',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    margin: '4px 0'
                  }}
                />

                {/* Section: Tools & Window */}
                <div
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    color: '#8baeff',
                    textTransform: 'uppercase',
                    padding: '3px 8px'
                  }}
                >
                  Tools & Window
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false)
                    setShowEnvModal(true)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '5px 8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#8baeff',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'rgba(117,157,255,0.1)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Key size={11} color="#8baeff" /> Inspect Environment Variables...
                </button>
                {onFocus && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false)
                      onFocus()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '5px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#ffc107',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.backgroundColor = 'rgba(255,193,7,0.1)')
                    }
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Star size={11} color="#ffc107" /> Focus Master in Split View
                  </button>
                )}
                {onOpenWebBeside && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false)
                      onOpenWebBeside()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '5px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#4da6ff',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.backgroundColor = 'rgba(77,166,255,0.1)')
                    }
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Columns2 size={11} color="#4da6ff" /> Open AI Chat Beside (1-Screen Split)
                  </button>
                )}
                {onDock && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false)
                      onDock()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '5px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#fbbf24',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.backgroundColor = 'rgba(251,191,36,0.1)')
                    }
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Pin size={11} color="#fbbf24" /> Dock Terminal to Sidebar
                  </button>
                )}

                <div
                  style={{
                    height: '1px',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    margin: '4px 0'
                  }}
                />

                {/* Section: Font Size */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '3px 8px'
                  }}
                >
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      color: '#8baeff',
                      textTransform: 'uppercase'
                    }}
                  >
                    Font ({terminalFontSize}px)
                  </span>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    <button
                      type="button"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent('nexus-zoom-terminal', { detail: { delta: -1 } })
                        )
                      }
                      style={{
                        padding: '1px 6px',
                        borderRadius: '3px',
                        background: 'rgba(255,255,255,0.08)',
                        border: 'none',
                        color: '#fff',
                        fontSize: '10px',
                        cursor: 'pointer'
                      }}
                    >
                      A-
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent('nexus-zoom-terminal', { detail: { reset: true } })
                        )
                      }
                      style={{
                        padding: '1px 6px',
                        borderRadius: '3px',
                        background: 'rgba(255,255,255,0.08)',
                        border: 'none',
                        color: '#fff',
                        fontSize: '10px',
                        cursor: 'pointer'
                      }}
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent('nexus-zoom-terminal', { detail: { delta: 1 } })
                        )
                      }
                      style={{
                        padding: '1px 6px',
                        borderRadius: '3px',
                        background: 'rgba(255,255,255,0.08)',
                        border: 'none',
                        color: '#fff',
                        fontSize: '10px',
                        cursor: 'pointer'
                      }}
                    >
                      A+
                    </button>
                  </div>
                </div>

                {onQuickResize && (
                  <>
                    <div
                      style={{
                        height: '1px',
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        margin: '4px 0'
                      }}
                    />
                    <div
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        color: '#8baeff',
                        textTransform: 'uppercase',
                        padding: '3px 8px'
                      }}
                    >
                      Resize Width
                    </div>
                    {[
                      { label: '⤢ 100% Full Width', percent: 100 },
                      { label: '◨ 67% (2/3 Width)', percent: 67 },
                      { label: '◧ 50% (Half Width)', percent: 50 },
                      { label: '◫ 33% (1/3 Width)', percent: 33 }
                    ].map((sz) => (
                      <button
                        key={sz.percent}
                        type="button"
                        onClick={() => {
                          setShowMoreMenu(false)
                          onQuickResize(sz.percent)
                        }}
                        style={{
                          width: '100%',
                          padding: '4px 8px',
                          background: 'transparent',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#eee',
                          fontSize: '11px',
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                        onMouseOver={(e) =>
                          (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                        }
                        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {sz.label}
                      </button>
                    ))}
                  </>
                )}

                <div
                  style={{
                    height: '1px',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    margin: '4px 0'
                  }}
                />
                <div
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    color: '#8baeff',
                    textTransform: 'uppercase',
                    padding: '3px 8px'
                  }}
                >
                  Dock Dev Preview
                </div>
                {detectedLocalhostUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false)
                      onSplitRight?.(
                        'webchat',
                        detectedLocalhostUrl,
                        `Dev (${detectedLocalhostUrl})`,
                        `persist:dev-${detectedLocalhostUrl}`
                      )
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '5px 8px',
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '4px',
                      color: '#34d399',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontWeight: 600
                    }}
                  >
                    ⚡ Active Server ({detectedLocalhostUrl})
                  </button>
                )}
                {[
                  { port: 3000, label: 'localhost:3000 (Next.js/React)' },
                  { port: 5173, label: 'localhost:5173 (Vite)' },
                  { port: 8080, label: 'localhost:8080 (Dev Server)' }
                ].map(({ port, label }) => (
                  <button
                    key={port}
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false)
                      onSplitRight?.(
                        'webchat',
                        `http://localhost:${port}`,
                        `Localhost:${port}`,
                        `persist:localhost-${port}`
                      )
                    }}
                    style={{
                      width: '100%',
                      padding: '4px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#eee',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                    }
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Globe size={11} color="#8baeff" /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Provider Badge */}
          {provider && provider.id !== 'local' && (
            <span
              style={{
                fontSize: '10px',
                color: '#aaa',
                backgroundColor: 'rgba(255,255,255,0.05)',
                padding: '2px 6px',
                borderRadius: '4px',
                marginRight: '2px'
              }}
            >
              {provider.icon} {provider.name}
            </span>
          )}

          {/* In-Pane Split Button (Right/Below unified) */}
          {(onSplitRight || onSplitDown) && (
            <button
              className="pane-split-button"
              onClick={() => setShowSplitMenu(showSplitMenu ? null : 'right')}
              title="Split terminal side-by-side or stacked"
              style={{
                background: showSplitMenu ? 'rgba(117,157,255,0.2)' : 'rgba(255,255,255,0.05)',
                border: showSplitMenu
                  ? '1px solid rgba(117,157,255,0.4)'
                  : '1px solid rgba(255,255,255,0.1)',
                color: showSplitMenu ? '#8baeff' : '#aaa',
                cursor: 'pointer',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '10.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <SplitSquareHorizontal size={12} />
              <span>Split</span>
              <ChevronDown size={9} />
            </button>
          )}

          {/* Split Dropdown Popup */}
          {showSplitMenu && (
            <div
              style={{
                position: 'absolute',
                top: '26px',
                right: '40px',
                backgroundColor: 'rgba(18, 18, 24, 0.98)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(117, 157, 255, 0.4)',
                boxShadow: '0 12px 30px rgba(0,0,0,0.8), 0 0 16px rgba(117,157,255,0.15)',
                borderRadius: '8px',
                padding: '6px',
                zIndex: 9999,
                width: '220px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}
            >
              {/* Direction selector tabs */}
              <div
                style={{
                  display: 'flex',
                  gap: '3px',
                  background: 'rgba(255,255,255,0.04)',
                  padding: '2px',
                  borderRadius: '5px'
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowSplitMenu('right')}
                  style={{
                    flex: 1,
                    padding: '3px 4px',
                    fontSize: '9.5px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border: 'none',
                    background:
                      showSplitMenu === 'right' ? 'rgba(117,157,255,0.25)' : 'transparent',
                    color: showSplitMenu === 'right' ? '#8baeff' : '#888',
                    cursor: 'pointer'
                  }}
                >
                  ◧ Right (50/50)
                </button>
                {onSplitDown && (
                  <button
                    type="button"
                    onClick={() => setShowSplitMenu('down')}
                    style={{
                      flex: 1,
                      padding: '3px 4px',
                      fontSize: '9.5px',
                      fontWeight: 600,
                      borderRadius: '4px',
                      border: 'none',
                      background:
                        showSplitMenu === 'down' ? 'rgba(117,157,255,0.25)' : 'transparent',
                      color: showSplitMenu === 'down' ? '#8baeff' : '#888',
                      cursor: 'pointer'
                    }}
                  >
                    ⬒ Below (Stack)
                  </button>
                )}
              </div>

              <div
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  color: '#8baeff',
                  textTransform: 'uppercase',
                  padding: '2px 4px'
                }}
              >
                Open in new pane:
              </div>

              <button
                type="button"
                onClick={() => {
                  const fn = showSplitMenu === 'down' ? onSplitDown : onSplitRight
                  fn?.('terminal')
                  setShowSplitMenu(null)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '5px 8px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#eee',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '11px'
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                }
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <TermIcon size={12} color="#8baeff" /> New Terminal (Shell)
              </button>

              {state.aiAccounts && state.aiAccounts.length > 0 ? (
                state.aiAccounts.map((acc) => {
                  const icon =
                    acc.providerId === 'claude'
                      ? '🧠'
                      : acc.providerId === 'chatgpt'
                        ? '🤖'
                        : acc.providerId === 'gemini'
                          ? '💎'
                          : '🦁'
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        const fn = showSplitMenu === 'down' ? onSplitDown : onSplitRight
                        fn?.('webchat', acc.url, acc.name, acc.partition, acc.id)
                        setShowSplitMenu(null)
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '5px 8px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#eee',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '11px'
                      }}
                      onMouseOver={(e) =>
                        (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                      }
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <span style={{ fontSize: '12px' }}>{icon}</span>
                        <span>{acc.name}</span>
                      </div>
                    </button>
                  )
                })
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const fn = showSplitMenu === 'down' ? onSplitDown : onSplitRight
                      fn?.(
                        'webchat',
                        'https://search.brave.com',
                        'Brave Browser',
                        'persist:account-brave-default'
                      )
                      setShowSplitMenu(null)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '5px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#eee',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '11px'
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                    }
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ fontSize: '12px' }}>🦁</span> Brave Web Browser
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const fn = showSplitMenu === 'down' ? onSplitDown : onSplitRight
                      fn?.(
                        'webchat',
                        'https://chatgpt.com',
                        'ChatGPT',
                        'persist:account-chatgpt-default'
                      )
                      setShowSplitMenu(null)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '5px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#eee',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '11px'
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                    }
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ fontSize: '12px' }}>🤖</span> ChatGPT Screen
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const fn = showSplitMenu === 'down' ? onSplitDown : onSplitRight
                      fn?.(
                        'webchat',
                        'https://claude.ai',
                        'Claude.ai',
                        'persist:account-claude-default'
                      )
                      setShowSplitMenu(null)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '5px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#eee',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '11px'
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                    }
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ fontSize: '12px' }}>🧠</span> Claude.ai Screen
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const fn = showSplitMenu === 'down' ? onSplitDown : onSplitRight
                      fn?.(
                        'webchat',
                        'https://gemini.google.com',
                        'Google Gemini',
                        'persist:account-gemini-default'
                      )
                      setShowSplitMenu(null)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '5px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#eee',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '11px'
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')
                    }
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ fontSize: '12px' }}>💎</span> Google Gemini
                  </button>
                </>
              )}
            </div>
          )}

          {/* Quick Font Size Toggle (Compact / Standard) */}
          <button
            type="button"
            onClick={() => {
              setTerminalFontSize((prev) => {
                const next = prev <= 11 ? 13 : 11
                localStorage.setItem('nexus-terminal-font-size', next.toString())
                if (termInstanceRef.current) {
                  termInstanceRef.current.options.fontSize = next
                  fitAddonRef.current?.fit()
                }
                return next
              })
            }}
            title={
              terminalFontSize <= 11
                ? 'Standard Font Size (13px)'
                : 'Compact Font Size (11px, more columns for CLI TUIs)'
            }
            style={{
              background: 'transparent',
              border: 'none',
              color: terminalFontSize <= 11 ? '#8baeff' : '#888',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '2px 4px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '4px'
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#8baeff')}
            onMouseOut={(e) =>
              (e.currentTarget.style.color = terminalFontSize <= 11 ? '#8baeff' : '#888')
            }
          >
            {terminalFontSize <= 11 ? 'A+' : 'A-'}
          </button>

          {/* Full Screen / Maximize Button */}
          {onMaximize && (
            <button
              onClick={onMaximize}
              title="Expand to Full Session View"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                display: 'flex',
                padding: '2px'
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#8baeff')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
            >
              <Maximize2 size={13} />
            </button>
          )}

          {/* Close Terminal Button with Double-check Verification Toast */}
          <button
            onClick={() => setShowCloseConfirm(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ff5f56',
              cursor: 'pointer',
              display: 'flex',
              padding: '2px',
              opacity: 0.75,
              transition: 'opacity 0.15s'
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '0.75')}
            title="Close Terminal"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Inter-terminal Communication: Speak Dock */}
      {showSpeakDock && (
        <div
          style={{
            backgroundColor: '#161821',
            borderBottom: '1px solid rgba(117, 157, 255, 0.35)',
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            zIndex: 15,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquareQuote size={13} color="#8baeff" />
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#8baeff' }}>
                Speak to Session:
              </span>
              {otherTerminals.length > 0 ? (
                <select
                  value={targetTerminalId}
                  onChange={(e) => setTargetTerminalId(e.target.value)}
                  style={{
                    backgroundColor: '#202430',
                    color: '#eee',
                    border: '1px solid rgba(117,157,255,0.3)',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '11px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {otherTerminals.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.cwd.split('/').pop() || t.cwd})
                    </option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>
                  No other active terminals open
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {speakFeedback && (
                <span style={{ fontSize: '10.5px', color: '#34d399', fontWeight: 600 }}>
                  {speakFeedback}
                </span>
              )}
              <button
                type="button"
                onClick={handlePipeOutput}
                title="Append recent output from this terminal into the message box"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#bbb',
                  fontSize: '10.5px',
                  cursor: 'pointer'
                }}
              >
                <Clipboard size={11} /> Pipe Output
              </button>
              <button
                type="button"
                onClick={handleSendHandoffToSession}
                title="Send lean git handoff context to target terminal"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(117,157,255,0.12)',
                  border: '1px solid rgba(117,157,255,0.3)',
                  color: '#8baeff',
                  fontSize: '10.5px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                <span>📦</span> Send Handoff
              </button>
              <button
                type="button"
                onClick={() => setShowSpeakDock(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#888',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex'
                }}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <textarea
              value={speakMessage}
              onChange={(e) => setSpeakMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void handleSendSpeak()
                }
              }}
              placeholder="Type message or instructions to pipe into target terminal... (Press ⌘↵ to Send)"
              rows={2}
              style={{
                flex: 1,
                backgroundColor: '#111318',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '5px',
                color: '#f0f6fc',
                padding: '6px 8px',
                fontSize: '11.5px',
                fontFamily: 'ui-monospace, monospace',
                resize: 'none',
                outline: 'none'
              }}
            />
            <button
              type="button"
              onClick={() => void handleSendSpeak()}
              disabled={!speakMessage.trim() || !targetTerminalId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                padding: '0 14px',
                borderRadius: '5px',
                backgroundColor:
                  speakMessage.trim() && targetTerminalId
                    ? '#3b82f6'
                    : 'rgba(255,255,255,0.06)',
                border: 'none',
                color: speakMessage.trim() && targetTerminalId ? '#fff' : '#666',
                fontSize: '11px',
                fontWeight: 600,
                cursor: speakMessage.trim() && targetTerminalId ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s'
              }}
            >
              <Send size={12} />
              <span>Send</span>
            </button>
          </div>
        </div>
      )}

      {/* Herdr-Style Blocker Banner: Waiting on User Approval */}
      {effectiveAgentStatus === 'waiting' && (
        <div
          style={{
            backgroundColor: 'rgba(239, 188, 105, 0.14)',
            borderBottom: '1px solid rgba(239, 188, 105, 0.4)',
            padding: '7px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            fontSize: '12.5px',
            zIndex: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <span
              style={{
                width: '9px',
                height: '9px',
                borderRadius: '50%',
                backgroundColor: '#efbc69',
                boxShadow: '0 0 10px #efbc69',
                flexShrink: 0
              }}
            />
            <span style={{ fontWeight: 700, color: '#efbc69', flexShrink: 0, fontSize: '12.5px' }}>
              Waiting on Input:
            </span>
            <span
              style={{
                color: '#fff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '420px',
                fontSize: '12px',
                fontFamily: 'ui-monospace, monospace'
              }}
              title={effectivePromptQuestion}
            >
              {effectivePromptQuestion || 'Command requires user approval'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => {
                manualActionTimestampRef.current = Date.now()
                stdoutBufferRef.current = ''
                window.electron.ipcRenderer.send('pty-write', id, 'y\r')
                termInstanceRef.current?.focus()
                setAgentDetection({
                  status: 'working',
                  promptQuestion: undefined,
                  lastActiveAt: Date.now()
                })
                dispatch({
                  type: 'UPDATE_TERMINAL_AGENT_STATE',
                  id,
                  agentState: {
                    status: 'working',
                    promptQuestion: undefined,
                    lastActiveAt: Date.now()
                  }
                })
              }}
              title="Send 'y' and Enter to approve (Instant execution)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 12px',
                backgroundColor: '#10b981',
                border: 'none',
                color: '#000',
                borderRadius: '5px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)'
              }}
            >
              ✓ Approve (y)
            </button>
            <button
              type="button"
              onClick={() => {
                manualActionTimestampRef.current = Date.now()
                stdoutBufferRef.current = ''
                window.electron.ipcRenderer.send('pty-write', id, 'n\r')
                termInstanceRef.current?.focus()
                setAgentDetection({
                  status: 'idle',
                  promptQuestion: undefined,
                  lastActiveAt: Date.now()
                })
                dispatch({
                  type: 'UPDATE_TERMINAL_AGENT_STATE',
                  id,
                  agentState: {
                    status: 'idle',
                    promptQuestion: undefined,
                    lastActiveAt: Date.now()
                  }
                })
              }}
              title="Send 'n' and Enter to deny"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 12px',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                color: '#ef4444',
                borderRadius: '5px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              ✕ Deny (n)
            </button>
            <button
              type="button"
              onClick={() => {
                manualActionTimestampRef.current = Date.now()
                stdoutBufferRef.current = ''
                window.electron.ipcRenderer.send('pty-write', id, '\r')
                termInstanceRef.current?.focus()
                setAgentDetection((prev) => ({
                  ...prev,
                  status: 'working',
                  promptQuestion: undefined
                }))
                dispatch({
                  type: 'UPDATE_TERMINAL_AGENT_STATE',
                  id,
                  agentState: {
                    status: 'working',
                    promptQuestion: undefined,
                    lastActiveAt: Date.now()
                  }
                })
              }}
              title="Send Enter (↵)"
              style={{
                padding: '4px 10px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                color: '#eee',
                borderRadius: '5px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              ↵ Enter
            </button>
          </div>
        </div>
      )}

      {/* Rate Limit Pause Banner ("A limit pauses. You choose.") */}
      {rateLimitPaused && (
        <div
          style={{
            backgroundColor: 'rgba(255, 152, 0, 0.15)',
            borderBottom: '1px solid rgba(255, 152, 0, 0.4)',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            color: '#ffb74d',
            fontSize: '12px',
            backdropFilter: 'blur(8px)',
            zIndex: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <AlertCircle size={16} color="#ff9800" style={{ flexShrink: 0 }} />
            <span style={{ fontWeight: 600, color: '#fff' }}>Limit Paused:</span>
            <span
              style={{
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                maxWidth: '320px',
                color: '#ffcc80'
              }}
            >
              {rateLimitPaused.message || 'Rate limit reached on this account.'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={() => performLeanHandoffAndSwitch()}
              disabled={isHandoffRunning}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                background: 'linear-gradient(135deg, #5579db, #3e5fb6)',
                color: '#fff',
                border: 'none',
                borderRadius: '5px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: isHandoffRunning ? 'wait' : 'pointer',
                boxShadow: '0 2px 8px rgba(0, 122, 204, 0.4)'
              }}
              title="Capture git state out-of-band and switch to another configured account with lean context (~500 tokens)"
            >
              <span>📦</span>
              <span>
                {isHandoffRunning ? 'Transferring...' : 'Lean Handoff & Switch (~500 tokens)'}
              </span>
            </button>
            <button
              onClick={() => {
                setRateLimitPaused(null)
                window.electron.ipcRenderer.send('pty-write', id, '\r')
              }}
              style={{
                padding: '4px 8px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#ddd',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '5px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              Wait & Resume
            </button>
            <button
              onClick={() => setRateLimitPaused(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex'
              }}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {terminalError && (
        <div className="terminal-status-error" role="alert">
          <span>{terminalError}</span>
          <button type="button" onClick={restartTerminal}>
            Restart terminal
          </button>
        </div>
      )}
      {handoffStatus && (
        <div className="terminal-status-success" role="status">
          <span>{handoffStatus}</span>
          <button onClick={() => setHandoffStatus(null)} aria-label="Dismiss handoff message">
            ×
          </button>
        </div>
      )}
      <div
        ref={terminalRef}
        onClick={() => {
          termInstanceRef.current?.focus()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setContextMenu({ x: e.clientX, y: e.clientY })
        }}
        style={{ flexGrow: 1, overflow: 'hidden', padding: '6px', cursor: 'text' }}
      />

      {/* Terminal Right-Click Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            backgroundColor: '#18181f',
            border: '1px solid rgba(117, 157, 255, 0.35)',
            borderRadius: '8px',
            padding: '4px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.85)',
            zIndex: 10000,
            minWidth: '190px',
            fontFamily: 'system-ui, sans-serif'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setContextMenu(null)
              pasteFromClipboard(false)
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              background: 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: '#8baeff',
              fontSize: '11px',
              cursor: 'pointer',
              textAlign: 'left'
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = 'rgba(117, 157, 255, 0.12)')
            }
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Clipboard size={12} />
            <span>Paste from Clipboard</span>
            <span style={{ marginLeft: 'auto', color: '#a3afbd', fontSize: '10px' }}>⌘V</span>
          </button>

          <button
            onClick={() => {
              setContextMenu(null)
              pasteFromClipboard(true)
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              background: 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: '#eee',
              fontSize: '11px',
              cursor: 'pointer',
              textAlign: 'left'
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')
            }
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <CornerDownLeft size={12} />
            <span>Paste & Submit (↵)</span>
          </button>

          <button
            onClick={() => {
              setContextMenu(null)
              if (termInstanceRef.current?.hasSelection()) {
                window.api
                  .writeClipboardText(termInstanceRef.current.getSelection())
                  .catch(() => {})
              }
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              background: 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: '#eee',
              fontSize: '11px',
              cursor: 'pointer',
              textAlign: 'left'
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')
            }
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span>📄</span>
            <span>Copy Selection</span>
            <span style={{ marginLeft: 'auto', color: '#a3afbd', fontSize: '10px' }}>⌘C</span>
          </button>

          <div
            style={{
              height: '1px',
              backgroundColor: 'rgba(255,255,255,0.08)',
              margin: '4px 0'
            }}
          />

          <button
            onClick={() => {
              setContextMenu(null)
              window.electron.ipcRenderer.send('pty-write', id, 'clear\r')
              termInstanceRef.current?.focus()
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              background: 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: '#aaa',
              fontSize: '11px',
              cursor: 'pointer',
              textAlign: 'left'
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')
            }
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span>🧹</span>
            <span>Clear Screen</span>
            <span style={{ marginLeft: 'auto', color: '#a3afbd', fontSize: '10px' }}>⌘K</span>
          </button>
        </div>
      )}

      {/* Attractive Toast Verification for Closing Terminal Session */}
      {showCloseConfirm && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(8, 11, 17, 0.88)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 600,
            padding: '16px'
          }}
          onClick={() => setShowCloseConfirm(false)}
        >
          <div
            style={{
              backgroundColor: '#161d2b',
              border: '1px solid rgba(239, 68, 68, 0.45)',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 35px rgba(239, 68, 68, 0.25)',
              borderRadius: '12px',
              padding: '20px 24px',
              maxWidth: '360px',
              width: '100%',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              animation: 'nexus-screen-in 0.18s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                display: 'grid',
                placeItems: 'center',
                color: '#ef4444'
              }}
            >
              <AlertTriangle size={22} />
            </div>

            <div>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#f8fafc',
                  marginBottom: '4px'
                }}
              >
                Close session "{name}"?
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.45 }}>
                Any active running processes, agent commands, or background tasks will be terminated.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                style={{
                  flex: 1,
                  padding: '9px 14px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: '#cbd5e1',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)')
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)')
                }
              >
                Cancel (Esc)
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowCloseConfirm(false)
                  handleClose()
                }}
                style={{
                  flex: 1,
                  padding: '9px 14px',
                  borderRadius: '8px',
                  border: '1px solid rgba(239, 68, 68, 0.6)',
                  background: 'linear-gradient(180deg, #ef4444, #dc2626)',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)'
                }}
                onMouseOver={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseOut={(e) => (e.currentTarget.style.filter = 'none')}
              >
                Close (↵)
              </button>
            </div>
          </div>
        </div>
      )}

      <EnvInspectorModal
        isOpen={showEnvModal}
        onClose={() => setShowEnvModal(false)}
        env={activeEnv}
        title={name}
      />
    </div>
  )
}
