import { ipcMain } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import os from 'os'
import fs from 'fs'

const execPromise = promisify(exec)

export interface ListeningPort {
  port: number
  pid: number
  command: string
  user: string
}

export interface GitBranchInfo {
  isGit: boolean
  branch?: string
  dirty?: boolean
  modifiedCount?: number
}

function resolvePath(dirPath?: string): string {
  if (!dirPath || dirPath === '~') return os.homedir()
  if (dirPath.startsWith('~/')) return path.join(os.homedir(), dirPath.slice(2))
  return path.resolve(dirPath)
}

export function initDevToolsManager(): void {
  // ─── Dev Port Manager ───────────────────────────
  ipcMain.handle('get-listening-ports', async (): Promise<ListeningPort[]> => {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execPromise('netstat -ano -p tcp', { timeout: 3000 })
        const ports: ListeningPort[] = []
        const lines = stdout.split('\n')
        for (const line of lines) {
          const match = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i)
          if (match) {
            const port = parseInt(match[1], 10)
            const pid = parseInt(match[2], 10)
            if (port > 0 && pid > 0) {
              ports.push({ port, pid, command: 'process', user: '' })
            }
          }
        }
        return ports
      }

      // macOS and Linux
      const { stdout } = await execPromise('lsof -iTCP -sTCP:LISTEN -n -P', { timeout: 3500 })
      const lines = stdout.split('\n').filter(Boolean)
      const results: ListeningPort[] = []
      const seen = new Set<string>()

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/)
        if (parts.length < 9) continue
        const command = parts[0]
        const pid = parseInt(parts[1], 10)
        const user = parts[2]
        const nodeName = parts[parts.length - 2] || parts[parts.length - 1]
        const portMatch = nodeName.match(/:(\d+)$/) || lines[i].match(/:(\d+)\s+\(LISTEN\)/)
        if (portMatch && pid) {
          const port = parseInt(portMatch[1], 10)
          const key = `${port}-${pid}`
          if (!seen.has(key)) {
            seen.add(key)
            results.push({
              port,
              pid,
              command,
              user
            })
          }
        }
      }

      // Sort by port ascending
      return results.sort((a, b) => a.port - b.port)
    } catch {
      return []
    }
  })

  ipcMain.handle('kill-port-process', async (_event, pid: number): Promise<boolean> => {
    if (!pid || typeof pid !== 'number' || pid <= 1) return false
    try {
      if (process.platform !== 'win32') {
        try {
          process.kill(-pid, 'SIGKILL')
        } catch {
          process.kill(pid, 'SIGKILL')
        }
      } else {
        await execPromise(`taskkill /F /PID ${pid}`)
      }
      return true
    } catch {
      try {
        process.kill(pid, 'SIGKILL')
        return true
      } catch {
        return false
      }
    }
  })

  // ─── Git Branch & Workspace Info ────────────────
  ipcMain.handle('get-git-info', async (_event, cwd: string): Promise<GitBranchInfo> => {
    try {
      const resolved = resolvePath(cwd)
      if (!fs.existsSync(resolved)) {
        return { isGit: false }
      }

      const branchRes = await execPromise('git rev-parse --abbrev-ref HEAD', {
        cwd: resolved,
        timeout: 2000
      }).catch(() => null)

      if (!branchRes || !branchRes.stdout.trim()) {
        return { isGit: false }
      }

      const branch = branchRes.stdout.trim()

      const statusRes = await execPromise('git status -s', {
        cwd: resolved,
        timeout: 2000
      }).catch(() => ({ stdout: '' }))

      const statusLines = statusRes.stdout.trim().split('\n').filter(Boolean)
      const dirty = statusLines.length > 0

      return {
        isGit: true,
        branch,
        dirty,
        modifiedCount: statusLines.length
      }
    } catch {
      return { isGit: false }
    }
  })
}
