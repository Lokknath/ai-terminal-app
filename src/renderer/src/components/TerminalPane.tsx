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
  SplitSquareVertical,
  ChevronDown,
  Terminal as TermIcon,
  Check,
  Clipboard,
  CornerDownLeft,
  Globe,
  AlertCircle,
  Sparkles,
  Copy,
  MoreHorizontal
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
  onClose
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
    return saved ? Math.max(10, Math.min(24, parseFloat(saved))) : 13.5
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
      const detail = (e as CustomEvent<{ delta?: number; reset?: boolean }>).detail
      setTerminalFontSize((prev) => {
        let next = prev
        if (detail.reset) {
          next = 13.5
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
            : null
        } catch {
          return null
        }
      })
    ).then((entries) => {
      if (active) setCliAuthInfo(Object.fromEntries(entries.filter((entry) => entry !== null)))
    })
    return () => {
      active = false
    }
  }, [state.aiAccounts])

  // Keep ordinary shells free of account overrides. A saved launch environment
  // is used only until the user explicitly chooses another profile.
  const activeEnv = useMemo((): Record<string, string> => {
    // A newly created pane may carry a custom launch environment. Preserve it until
    // the user explicitly switches profiles; then use only the selected profile.
    if (!accountOverride && env && Object.keys(env).length > 0) return env
    if (selectedAccountId && selectedAccountId !== 'all') {
      const acc = state.aiAccounts.find((a) => a.id === selectedAccountId)
      if (acc) {
        return getAccountEnv(acc)
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
        return getAccountEnv(matchingAcc)
      }
    }
    return {}
  }, [accountOverride, env, selectedAccountId, providerId, state.aiAccounts])

  useEffect(() => {
    activeEnvRef.current = activeEnv
  }, [activeEnv])

  const provider = getProvider(providerId)

  // Clipboard paste helper for tokens and terminal input
  const pasteFromClipboard = async (andSubmit = false): Promise<void> => {
    try {
      const text = await window.api.readClipboardText()
      if (!text || !text.trim()) {
        setPasteFeedback({ text: 'Empty', success: false })
        setTimeout(() => setPasteFeedback(null), 1500)
        return
      }

      // If submitting directly (e.g. auth token prompt), trim whitespace and append \r
      const cleanText = andSubmit ? `${text.trim()}\r` : text
      window.electron.ipcRenderer.send('pty-write', id, cleanText)
      termInstanceRef.current?.focus()

      const charCount = text.trim().length
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

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily:
        "'JetBrains Mono', 'SF Mono', Menlo, Monaco, 'Cascadia Code', 'Fira Code', ui-monospace, monospace",
      fontSize: terminalFontSize,
      lineHeight: 1.35,
      letterSpacing: 0,
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
          window.api
            .readClipboardText()
            .then((clipText) => {
              if (clipText) {
                // If it's a multiline cURL command with trailing backslashes, normalize for flawless shell execution
                const textToSend =
                  clipText.includes('curl ') && clipText.includes('\\')
                    ? clipText.replace(/\\\r?\n\s*/g, ' ')
                    : clipText
                window.electron.ipcRenderer.send('pty-write', id, textToSend)
              }
            })
            .catch(() => {})
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
    if (term.textarea) {
      term.textarea.addEventListener('focus', () => {
        dispatch({ type: 'SET_ACTIVE_SESSION', id })
      })
    }

    // Slight delay for layout transitions before fitting & spawning
    const timer = setTimeout(() => {
      fitAddon.fit()
      term.focus()
      window.electron.ipcRenderer.send('pty-create', id, name, cwd, command, activeEnvRef.current)
      if (Object.keys(activeEnvRef.current).length > 0) {
        term.write(
          `\x1b[36m⚡ [AI Credentials Active]: ${Object.keys(activeEnvRef.current).join(', ')}\x1b[0m\r\n`
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

    const handleResize = (): void => {
      try {
        fitAddon.fit()
        window.electron.ipcRenderer.send('pty-resize', id, term.cols, term.rows)
      } catch {
        /* ignore fit errors on unmounted containers */
      }
    }

    window.addEventListener('resize', handleResize)

    const observer = new ResizeObserver(() => {
      handleResize()
    })
    observer.observe(terminalRef.current)

    return () => {
      clearTimeout(timer)
      if (detectionDebounceTimerRef.current) {
        clearTimeout(detectionDebounceTimerRef.current)
      }
      termContainer.removeEventListener('click', focusTerminal)
      termContainer.removeEventListener('mousedown', focusTerminal)
      window.electron.ipcRenderer.removeAllListeners(`pty-out-${id}`)
      window.electron.ipcRenderer.removeAllListeners(`pty-error-${id}`)
      window.electron.ipcRenderer.removeAllListeners(`pty-exit-${id}`)
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
    }
  }, [id, name, cwd, command])

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
      termInstanceRef.current.write(
        `\x1b[32m✔ Spawning shell with isolated profile: ${Object.keys(newEnv).join(', ') || 'Default'}\x1b[0m\r\n\r\n`
      )
    }
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
            ? '1.5px solid #efbc69'
            : isActive
              ? '1.5px solid #8baeff'
              : effectiveAgentStatus === 'working'
                ? '1px solid rgba(139, 174, 255, 0.45)'
                : '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow:
          effectiveAgentStatus === 'waiting'
            ? '0 0 18px rgba(239, 188, 105, 0.35)'
            : isActive
              ? '0 0 16px rgba(139, 174, 255, 0.28)'
              : 'none',
        transition: 'border 0.15s, box-shadow 0.15s'
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
          <span
            style={{
              fontWeight: 600,
              letterSpacing: '0.4px',
              fontSize: '12px',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              maxWidth: '120px'
            }}
            title={name}
          >
            {name}
          </span>
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
                      const email = cliAuthInfo[acc.id]
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
                  const email = cliAuthInfo[acc.id]
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
          {/* Restart Terminal */}
          <button
            onClick={restartTerminal}
            title="Restart Terminal Session"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#888',
              cursor: 'pointer',
              borderRadius: '4px',
              padding: '2px 5px',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              transition: 'all 0.15s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = '#fff'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = '#888'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
            }}
          >
            <RotateCw size={11} />
          </button>

          {/* More Actions Dropdown (•••) */}
          <div style={{ position: 'relative' }} ref={moreMenuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowMoreMenu(!showMoreMenu)
              }}
              title="Terminal Tools & Options"
              style={{
                background: showMoreMenu ? 'rgba(117,157,255,0.2)' : 'rgba(255,255,255,0.04)',
                border: showMoreMenu
                  ? '1px solid rgba(117,157,255,0.4)'
                  : '1px solid rgba(255,255,255,0.1)',
                color: showMoreMenu ? '#8baeff' : '#aaa',
                cursor: 'pointer',
                borderRadius: '4px',
                padding: '2px 5px',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
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
                  minWidth: '210px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}
              >
                <div
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    color: '#8baeff',
                    textTransform: 'uppercase',
                    padding: '3px 8px'
                  }}
                >
                  Quick Actions
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
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false)
                    termInstanceRef.current?.clear()
                    window.electron.ipcRenderer.send(`pty-in-${id}`, 'clear\r')
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
                      fontSize: '9.5px',
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
                        fontSize: '9.5px',
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
                        onMouseOut={(e) =>
                          (e.currentTarget.style.backgroundColor = 'transparent')
                        }
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
                    fontSize: '9.5px',
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
                      padding: '5px 8px',
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
                    onMouseOut={(e) =>
                      (e.currentTarget.style.backgroundColor = 'transparent')
                    }
                  >
                    <Globe size={11} color="#8baeff" /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
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

          {/* In-Pane Split Right Button */}
          {onSplitRight && (
            <button
              className="pane-split-button"
              onClick={() => setShowSplitMenu(showSplitMenu === 'right' ? null : 'right')}
              title="Split Right with another terminal or webchat"
              style={{
                background:
                  showSplitMenu === 'right' ? 'rgba(117,157,255,0.2)' : 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: showSplitMenu === 'right' ? '#8baeff' : '#aaa',
                cursor: 'pointer',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <SplitSquareHorizontal size={12} /> Split ◧ <ChevronDown size={9} />
            </button>
          )}

          {/* In-Pane Split Down Button */}
          {onSplitDown && (
            <button
              className="pane-split-button"
              onClick={() => setShowSplitMenu(showSplitMenu === 'down' ? null : 'down')}
              title="Split Below with another terminal or webchat"
              style={{
                background:
                  showSplitMenu === 'down' ? 'rgba(117,157,255,0.2)' : 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: showSplitMenu === 'down' ? '#8baeff' : '#aaa',
                cursor: 'pointer',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <SplitSquareVertical size={12} /> ⬒
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
                width: '210px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
              }}
            >
              <div
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  color: '#8baeff',
                  textTransform: 'uppercase',
                  padding: '3px 6px'
                }}
              >
                Split {showSplitMenu === 'right' ? 'Right (50/50)' : 'Below (Stacked)'} with:
              </div>
              <button
                onClick={() => {
                  const fn = showSplitMenu === 'right' ? onSplitRight : onSplitDown
                  fn?.('terminal')
                  setShowSplitMenu(null)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 8px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '5px',
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
                <TermIcon size={13} color="#8baeff" /> New Terminal (Shell)
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
                      onClick={() => {
                        const fn = showSplitMenu === 'right' ? onSplitRight : onSplitDown
                        fn?.('webchat', acc.url, acc.name, acc.partition, acc.id)
                        setShowSplitMenu(null)
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '5px',
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
                        <span style={{ fontSize: '13px' }}>{icon}</span>
                        <span>{acc.name}</span>
                      </div>
                    </button>
                  )
                })
              ) : (
                <>
                  <button
                    onClick={() => {
                      const fn = showSplitMenu === 'right' ? onSplitRight : onSplitDown
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
                      padding: '6px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '5px',
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
                    <span style={{ fontSize: '13px' }}>🦁</span> Brave Web Browser
                  </button>
                  <button
                    onClick={() => {
                      const fn = showSplitMenu === 'right' ? onSplitRight : onSplitDown
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
                      padding: '6px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '5px',
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
                    <span style={{ fontSize: '13px' }}>🤖</span> ChatGPT Screen
                  </button>
                  <button
                    onClick={() => {
                      const fn = showSplitMenu === 'right' ? onSplitRight : onSplitDown
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
                      padding: '6px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '5px',
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
                    <span style={{ fontSize: '13px' }}>🧠</span> Claude.ai Screen
                  </button>
                  <button
                    onClick={() => {
                      const fn = showSplitMenu === 'right' ? onSplitRight : onSplitDown
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
                      padding: '6px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '5px',
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
                    <span style={{ fontSize: '13px' }}>💎</span> Google Gemini
                  </button>
                </>
              )}
            </div>
          )}

          {/* Focus in Split View Button */}
          {onFocus && (
            <button
              onClick={onFocus}
              title="Focus this terminal in split view (Master)"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                display: 'flex',
                padding: '2px'
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#ffc107')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
            >
              <Star size={13} />
            </button>
          )}

          {/* Open Web-Chat Beside Button (1 Screen Split) */}
          {onOpenWebBeside && (
            <button
              onClick={onOpenWebBeside}
              title="Open AI Web-Chat / Browser beside this terminal (1-Screen Split)"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                display: 'flex',
                padding: '2px'
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#4da6ff')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
            >
              <Columns2 size={13} />
            </button>
          )}

          {/* Full Screen Button */}
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

          {/* Dock to Sidebar Button */}
          {onDock && (
            <button
              onClick={onDock}
              title="Dock to Sidebar"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                display: 'flex',
                padding: '2px'
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#ffc107')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
            >
              <Pin size={13} />
            </button>
          )}

          <button
            onClick={handleClose}
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
    </div>
  )
}
