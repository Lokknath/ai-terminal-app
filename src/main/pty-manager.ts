import * as pty from 'node-pty'
import { ipcMain, WebContents } from 'electron'
import os from 'os'
import path from 'path'
import fs from 'fs'

interface ManagedPty {
  process: pty.IPty
  owner: WebContents
  bootstrap?: ReturnType<typeof setTimeout>
  exited: Promise<void>
  markExited: () => void
  buffer: string[]
  bufferLength: number
}

const processes = new Map<string, ManagedPty>()
const retiring = new Set<ManagedPty>()
const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash'
let initialized = false

function resolvePath(value?: string): string {
  if (!value || value === '~') return os.homedir()
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2))
  return path.resolve(value)
}

function resolveEnv(customEnv?: Record<string, string>): Record<string, string> {
  const resolved: Record<string, string> = {}
  for (const [key, value] of Object.entries(customEnv || {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string') continue
    resolved[key] = value === '~' || value.startsWith('~/') ? resolvePath(value) : value
  }
  return resolved
}

function send(owner: WebContents, channel: string, value: string | number): void {
  if (!owner.isDestroyed()) owner.send(channel, value)
}

function killProcessTree(pid: number, signal: NodeJS.Signals | string = 'SIGTERM'): void {
  if (!pid) return
  if (process.platform !== 'win32') {
    try {
      process.kill(-pid, signal)
    } catch {
      try {
        process.kill(pid, signal)
      } catch {
        // Process already terminated
      }
    }
  } else {
    try {
      process.kill(pid, signal)
    } catch {
      // Process already terminated
    }
  }
}

function stop(id: string, owner?: WebContents, force = false): void {
  const entry = processes.get(id)
  if (!entry || (owner && entry.owner !== owner)) return
  processes.delete(id) // Retire first so a late exit cannot remove a replacement.
  retiring.add(entry)
  if (entry.bootstrap) clearTimeout(entry.bootstrap)
  const signal = force ? 'SIGKILL' : 'SIGTERM'
  killProcessTree(entry.process.pid, signal)
  try {
    entry.process.kill(signal)
  } catch {
    // A shell may have exited before the close event arrives.
  }
}

export function forceKillPty(id: string, owner?: WebContents): void {
  stop(id, owner, true)
}

export function emergencyCleanupSync(): void {
  for (const entry of processes.values()) {
    try {
      if (entry.bootstrap) clearTimeout(entry.bootstrap)
      killProcessTree(entry.process.pid, 'SIGKILL')
      entry.process.kill('SIGKILL')
    } catch {
      // ignore
    }
  }
  for (const entry of retiring) {
    try {
      killProcessTree(entry.process.pid, 'SIGKILL')
      entry.process.kill('SIGKILL')
    } catch {
      // ignore
    }
  }
  processes.clear()
  retiring.clear()
}

function start(
  owner: WebContents,
  id: string,
  name: string,
  cwd: string,
  command?: string,
  customEnv?: Record<string, string>
): void {
  if (typeof id !== 'string' || !id || processes.has(id)) return
  try {
    const directory = resolvePath(cwd)
    if (!fs.statSync(directory).isDirectory()) throw new Error('Working directory is not a folder')
    const custom = resolveEnv(customEnv)
    for (const key of [
      'CODEX_HOME',
      'CLAUDE_CONFIG_DIR',
      'GEMINI_DIR',
      'GEMINI_CLI_DIR',
      'ANTIGRAVITY_APP_DATA_DIR'
    ]) {
      if (custom[key]) fs.mkdirSync(custom[key], { recursive: true })
    }
    const existingPath = (process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin').split(path.delimiter)
    const extraPath = [
      path.join(os.homedir(), '.npm-global', 'bin'),
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), '.cargo', 'bin'),
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/local/bin'
    ]
    const shellArgs = process.platform === 'win32' ? [] : ['-l']
    const child = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: directory,
      env: {
        ...process.env,
        USER: process.env.USER || os.userInfo().username,
        LOGNAME: process.env.LOGNAME || process.env.USER || os.userInfo().username,
        HOME: os.homedir(),
        SHELL: shell,
        LANG: process.env.LANG || 'en_US.UTF-8',
        PATH: [...new Set([...extraPath, ...existingPath])].join(path.delimiter),
        TERMINAL_NAME: name,
        NEXUS_ENV: '1',
        NEXUS_PANE_ID: id,
        ...custom
      } as Record<string, string>
    })
    let markExited!: () => void
    const exited = new Promise<void>((resolve) => {
      markExited = resolve
    })
    const entry: ManagedPty = {
      process: child,
      owner,
      exited,
      markExited,
      buffer: [],
      bufferLength: 0
    }
    processes.set(id, entry)
    child.onData((data) => {
      entry.buffer.push(data)
      entry.bufferLength += data.length
      while (entry.bufferLength > 100_000 && entry.buffer.length > 1) {
        const removed = entry.buffer.shift()
        if (removed) entry.bufferLength -= removed.length
      }
      if (processes.get(id) === entry) send(owner, `pty-out-${id}`, data)
    })
    child.onExit(({ exitCode }) => {
      entry.markExited()
      retiring.delete(entry)
      if (processes.get(id) !== entry) return
      processes.delete(id)
      if (entry.bootstrap) clearTimeout(entry.bootstrap)
      send(owner, `pty-exit-${id}`, exitCode)
    })
    if (command) {
      let executed = false
      const runBootstrap = (): void => {
        if (executed) return
        executed = true
        if (processes.get(id) === entry) child.write(`${command}\r`)
      }
      const initialDataDisposable = child.onData(() => {
        initialDataDisposable.dispose()
        setTimeout(runBootstrap, 120)
      })
      entry.bootstrap = setTimeout(() => {
        initialDataDisposable.dispose()
        runBootstrap()
      }, 700)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start terminal'
    send(owner, `pty-error-${id}`, message)
  }
}

export async function cleanupAllPty(): Promise<void> {
  for (const id of processes.keys()) stop(id)
  if (retiring.size === 0) return

  // node-pty posts its exit callback from a native thread. Let those callbacks
  // reach JS before Electron tears down the Node environment on app quit.
  const waitForExit = async (timeout: number): Promise<void> => {
    if (retiring.size === 0) return
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        Promise.all([...retiring].map((entry) => entry.exited)),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeout)
        })
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  await waitForExit(1200)
  for (const entry of retiring) {
    try {
      killProcessTree(entry.process.pid, 'SIGKILL')
      entry.process.kill('SIGKILL')
    } catch {
      // It may have exited between the timeout and the force kill.
    }
  }
  await waitForExit(1200)
}

export function initPtyManager(): void {
  if (initialized) return
  initialized = true

  ipcMain.on(
    'pty-create',
    (
      event,
      id: string,
      name: string,
      cwd: string,
      command?: string,
      env?: Record<string, string>
    ) => {
      start(event.sender, id, name, cwd, command, env)
    }
  )
  ipcMain.on(
    'pty-restart',
    (
      event,
      id: string,
      name: string,
      cwd: string,
      command?: string,
      env?: Record<string, string>
    ) => {
      const existing = processes.get(id)
      if (existing && existing.owner !== event.sender) return
      stop(id, event.sender)
      start(event.sender, id, name, cwd, command, env)
    }
  )
  ipcMain.on('pty-write', (event, id: string, data: string) => {
    const entry = processes.get(id)
    if (entry?.owner === event.sender && typeof data === 'string') entry.process.write(data)
  })
  ipcMain.on('pty-input', (event, arg1: string | { id: string; data: string }, arg2?: string) => {
    let id = ''
    let data = ''
    if (typeof arg1 === 'object' && arg1 !== null) {
      id = arg1.id
      data = arg1.data
    } else if (typeof arg1 === 'string') {
      id = arg1
      data = typeof arg2 === 'string' ? arg2 : ''
    }
    const entry = processes.get(id)
    if (entry?.owner === event.sender && typeof data === 'string') {
      entry.process.write(data)
    }
  })
  ipcMain.on('pty-resize', (event, id: string, cols: number, rows: number) => {
    const entry = processes.get(id)
    if (
      entry?.owner === event.sender &&
      Number.isInteger(cols) &&
      Number.isInteger(rows) &&
      cols > 0 &&
      rows > 0
    ) {
      entry.process.resize(cols, rows)
    }
  })
  ipcMain.on('pty-kill', (event, id: string) => stop(id, event.sender))
  ipcMain.on('pty-force-kill', (event, id: string) => {
    if (typeof id === 'string') {
      stop(id, event.sender, true)
    }
  })
  ipcMain.on('pty-broadcast', (_event, input: string) => {
    if (typeof input !== 'string') return
    for (const entry of processes.values()) {
      try {
        entry.process.write(input)
      } catch {
        // Process may have exited
      }
    }
  })
  ipcMain.on(
    'pty-send-to-targets',
    (_event, payload: { targetIds: string[]; input: string } | string[]) => {
      // Support both { targetIds, input } object and targetIds array
      if (!payload) return
      if (typeof payload === 'object' && 'targetIds' in payload && 'input' in payload) {
        const { targetIds, input } = payload as { targetIds: string[]; input: string }
        if (!Array.isArray(targetIds) || typeof input !== 'string') return
        for (const id of targetIds) {
          const entry = processes.get(id)
          if (entry) {
            try {
              entry.process.write(input)
            } catch {
              // Process may have exited
            }
          }
        }
      }
    }
  )
  ipcMain.on('pty-request-history', (event, id: string) => {
    const entry = processes.get(id)
    if (entry && entry.buffer.length > 0) {
      send(event.sender, `pty-history-${id}`, entry.buffer.join(''))
    }
  })
}
