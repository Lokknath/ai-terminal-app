import { execFile } from 'child_process'
import { promisify } from 'util'
import { ipcMain } from 'electron'
import os from 'os'
import path from 'path'

const execFilePromise = promisify(execFile)

export interface DetectedCLI {
  cmd: string
  name: string
  providerId: string
  path: string
}

const KNOWN_CLI_AGENTS = [
  { cmd: 'claude', name: 'Claude Code', providerId: 'claude-cli' },
  { cmd: 'codex', name: 'Codex CLI', providerId: 'codex-cli' },
  { cmd: 'agy', name: 'Antigravity CLI (agy)', providerId: 'agy-cli' },
  { cmd: 'gh', name: 'GitHub CLI', providerId: 'gh-copilot' },
  { cmd: 'cursor', name: 'Cursor Agent', providerId: 'cursor-cli' }
]

export function getSystemPath(): string {
  const home = os.homedir()
  const customPaths =
    process.platform === 'win32'
      ? [
          path.join(home, 'AppData', 'Roaming', 'npm'),
          path.join(home, 'AppData', 'Local', 'Programs'),
          path.join(home, '.cargo', 'bin')
        ]
      : [
          path.join(home, '.npm-global', 'bin'),
          path.join(home, '.local', 'bin'),
          path.join(home, '.cargo', 'bin'),
          '/opt/homebrew/bin',
          '/opt/homebrew/sbin',
          '/usr/local/bin',
          '/usr/bin',
          '/bin',
          '/usr/sbin',
          '/sbin'
        ]
  const existing = process.env.PATH ? process.env.PATH.split(path.delimiter) : []
  return Array.from(new Set([...customPaths, ...existing])).join(path.delimiter)
}

export async function detectAvailableAgents(): Promise<DetectedCLI[]> {
  const envPath = getSystemPath()
  const lookupCmd = process.platform === 'win32' ? 'where' : 'which'

  const results = await Promise.all(
    KNOWN_CLI_AGENTS.map(async (agent) => {
      try {
        const { stdout } = await execFilePromise(lookupCmd, [agent.cmd], {
          env: { ...process.env, PATH: envPath },
          timeout: 2500
        })
        const firstLine = stdout.trim().split(/\r?\n/)[0]?.trim()
        if (firstLine) {
          return { ...agent, path: firstLine }
        }
      } catch {
        /* not installed */
      }
      return null
    })
  )

  return results.filter((item): item is DetectedCLI => item !== null)
}

export function initAgentRegistry(): void {
  ipcMain.handle('detect-cli-agents', async () => {
    return await detectAvailableAgents()
  })
}
