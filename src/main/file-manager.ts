import { ipcMain, dialog, BrowserWindow } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import os from 'os'

const execPromise = promisify(exec)

export interface DirectoryItem {
  name: string
  path: string
  hasChildren: boolean
}

export interface HandoffResult {
  success: boolean
  handoffPath: string
  gitStatus: string
  gitDiff: string
  prompt: string
}

function resolvePath(dirPath?: string): string {
  if (!dirPath || dirPath === '~') return os.homedir()
  if (dirPath.startsWith('~/')) return path.join(os.homedir(), dirPath.slice(2))
  return path.resolve(dirPath)
}

export function initFileManager(mainWindow?: BrowserWindow): void {
  ipcMain.handle('get-system-folders', () => {
    const home = os.homedir()
    return [
      { name: 'Home', path: home, icon: 'home' },
      { name: 'Documents', path: path.join(home, 'Documents'), icon: 'documents' },
      { name: 'Desktop', path: path.join(home, 'Desktop'), icon: 'desktop' },
      { name: 'Downloads', path: path.join(home, 'Downloads'), icon: 'downloads' }
    ]
  })

  ipcMain.handle('read-directory', async (_event, dirPath: string) => {
    try {
      const resolved = resolvePath(dirPath)
      const entries = await fs.promises.readdir(resolved, { withFileTypes: true })
      const visible = entries.filter((entry) => !entry.name.startsWith('.') && entry.isDirectory())
      const folders: DirectoryItem[] = []
      // Bound concurrent subdirectory reads so large folders stay responsive.
      for (let index = 0; index < visible.length; index += 16) {
        const batch = await Promise.all(
          visible.slice(index, index + 16).map(async (entry) => {
            const fullPath = path.join(resolved, entry.name)
            let hasChildren = false
            try {
              const children = await fs.promises.readdir(fullPath, { withFileTypes: true })
              hasChildren = children.some(
                (child) => !child.name.startsWith('.') && child.isDirectory()
              )
            } catch {
              // A folder can still be selected when its contents are unavailable.
            }
            return { name: entry.name, path: fullPath, hasChildren }
          })
        )
        folders.push(...batch)
      }
      return folders.sort((a, b) => a.name.localeCompare(b.name))
    } catch (err) {
      console.warn(`[FileManager] Could not read directory "${dirPath}":`, err)
      return []
    }
  })

  ipcMain.handle('select-directory', async (event, defaultPath?: string) => {
    const resolvedDefault = defaultPath ? resolvePath(defaultPath) : os.homedir()
    const targetWindow =
      BrowserWindow.fromWebContents(event.sender) ||
      BrowserWindow.getFocusedWindow() ||
      (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null)
    const options: Electron.OpenDialogOptions = {
      title: 'Select Project Directory',
      defaultPath: resolvedDefault,
      properties: ['openDirectory', 'createDirectory']
    }
    const result = targetWindow
      ? await dialog.showOpenDialog(targetWindow, options)
      : await dialog.showOpenDialog(options)

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  // Out-of-band state capture: runs git commands in cwd via Node.js, completely bypassing stuck PTYs
  ipcMain.handle(
    'generate-handoff-state',
    async (
      _event,
      cwd: string,
      accountName?: string,
      taskSummary?: string
    ): Promise<HandoffResult> => {
      const resolved = resolvePath(cwd)
      let gitBranch = ''
      let gitStatus = ''
      let gitDiff = ''
      let recentCommits = ''

      try {
        const branchRes = await execPromise('git branch --show-current', {
          cwd: resolved,
          timeout: 2000
        }).catch(() => ({ stdout: '' }))
        gitBranch = branchRes.stdout.trim()

        const statusRes = await execPromise('git status -s', {
          cwd: resolved,
          timeout: 3000
        }).catch(() => ({ stdout: '' }))
        gitStatus = statusRes.stdout.trim()

        const diffRes = await execPromise('git diff --stat', {
          cwd: resolved,
          timeout: 3000
        }).catch(() => ({ stdout: '' }))
        gitDiff = diffRes.stdout.trim()

        const logRes = await execPromise('git log -n 3 --oneline', {
          cwd: resolved,
          timeout: 2000
        }).catch(() => ({ stdout: '' }))
        recentCommits = logRes.stdout.trim()
      } catch {
        /* fallback if not a git repository */
      }

      const timestamp = new Date().toISOString()
      const handoffContent = `# Nexus Handoff State
Captured at: ${timestamp}
Source Account: ${accountName || 'Primary Agent'}
Workspace Directory: ${resolved}
${gitBranch ? `Active Branch: ${gitBranch}\n` : ''}
## Task Goal
${taskSummary || 'Resume active coding task. Retain all modifications already on disk.'}

## Current Disk & Git State
\`\`\`
${gitStatus || 'Working tree clean or not a git repository.'}
\`\`\`

## Diff Summary
\`\`\`
${gitDiff || 'No uncommitted line diffs.'}
\`\`\`

${recentCommits ? `## Recent Commits\n\`\`\`\n${recentCommits}\n\`\`\`\n` : ''}
## Immediate Next Steps for Resuming Agent
1. Inspect files listed in the git status above.
2. Continue implementing user objectives without replaying previous conversations.
3. Verify changes with testing/build commands before concluding.
`

      const nexusDir = path.join(resolved, '.nexus')
      if (!fs.existsSync(nexusDir)) {
        try {
          fs.mkdirSync(nexusDir, { recursive: true })
        } catch {
          /* ignore */
        }
      }

      const handoffPath = path.join(nexusDir, 'handoff.md')
      let saved = false
      try {
        fs.writeFileSync(handoffPath, handoffContent, 'utf-8')
        saved = true
      } catch (err) {
        console.error('Failed to write handoff file:', err)
      }

      // Also write root .handoff.md for easy discovery if permissions allow
      try {
        fs.writeFileSync(path.join(resolved, '.handoff.md'), handoffContent, 'utf-8')
      } catch {
        /* workspace root may be write-restricted in monorepos or container mounts */
      }

      const prompt = `Resume task from handoff. Read .nexus/handoff.md and run 'git status' to inspect current disk state. Focus strictly on Next Steps.`

      return {
        success: saved,
        handoffPath,
        gitStatus,
        gitDiff,
        prompt
      }
    }
  )
}
