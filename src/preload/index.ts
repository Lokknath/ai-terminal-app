import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface AccountUsage {
  usedTokens?: number
  limitTokens?: number
  quotaPercent?: number
  requestsRemaining?: number
  resetsAt?: string | number
  tier?: string
  windows?: {
    id: string
    label: string
    bucket?: string
    usedPercent?: number
    resetsAt?: number
    observedAt?: number
  }[]
  resets?: {
    available?: number
    fullAvailable?: number
    fiveHourAvailable?: number
    expiresAt?: number
  }
  source?: 'local-codex' | 'claude-web' | 'manual'
  observedAt?: number
}

export interface AIAccount {
  id: string
  providerId: 'claude' | 'chatgpt' | 'gemini' | 'custom'
  name: string
  url: string
  partition: string
  cliConfigDir?: string
  googleEmail?: string
  isDefault?: boolean
  usage?: AccountUsage
  envVars?: Record<string, string>
  createdAt: number
}

export interface CLIAccountAuth {
  loggedIn: boolean
  email?: string
  subscriptionType?: string
  authMethod?: string
  configDir?: string
  usage?: AccountUsage
}

export interface DirectoryItem {
  name: string
  path: string
  hasChildren: boolean
}

export interface SystemFolder {
  name: string
  path: string
  icon: string
}

export interface HandoffResult {
  success: boolean
  handoffPath: string
  gitStatus: string
  gitDiff: string
  prompt: string
}

export interface ApiRequestInput {
  id: string
  method: string
  url: string
  headers: Record<string, string>
  body?: string
}

export interface ApiResponseOutput {
  status: number
  statusText: string
  url: string
  headers: Record<string, string>
  body: string
  durationMs: number
  sizeBytes: number
  truncated: boolean
}

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

// Custom APIs for renderer
const api = {
  // ─── BYOA Detection ───────────────────────────
  detectCLIAgents: (): Promise<{ cmd: string; name: string; providerId: string; path: string }[]> =>
    ipcRenderer.invoke('detect-cli-agents'),

  // ─── AI Accounts & Multi-Logins ───────────────
  getAIAccounts: (): Promise<AIAccount[]> => ipcRenderer.invoke('get-ai-accounts'),
  saveAIAccount: (account: AIAccount): Promise<boolean> =>
    ipcRenderer.invoke('save-ai-account', account),
  deleteAIAccount: (id: string): Promise<boolean> => ipcRenderer.invoke('delete-ai-account', id),
  getCLIAccountAuth: (account: AIAccount): Promise<CLIAccountAuth> =>
    ipcRenderer.invoke('get-cli-account-auth', account),
  getAccountUsage: (id: string): Promise<AccountUsage | null> =>
    ipcRenderer.invoke('get-account-usage', id),
  saveAccountUsage: (id: string, usage: AccountUsage | null): Promise<boolean> =>
    ipcRenderer.invoke('save-account-usage', id, usage),
  checkPartitionWebAuth: (
    partition: string,
    providerId: string
  ): Promise<{ isAuthenticated: boolean; cookieCount: number; userEmail?: string }> =>
    ipcRenderer.invoke('check-partition-web-auth', partition, providerId),
  openExternalURL: (url: string): Promise<boolean> => ipcRenderer.invoke('open-external-url', url),

  // ─── Finder-Like File Navigation ──────────────
  getSystemFolders: (): Promise<SystemFolder[]> => ipcRenderer.invoke('get-system-folders'),
  readDirectory: (dirPath: string): Promise<DirectoryItem[]> =>
    ipcRenderer.invoke('read-directory', dirPath),
  selectDirectory: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('select-directory', defaultPath),

  // ─── Out-of-Band Handoff Engine ───────────────
  generateHandoffState: (
    cwd: string,
    accountName?: string,
    taskSummary?: string
  ): Promise<HandoffResult> =>
    ipcRenderer.invoke('generate-handoff-state', cwd, accountName, taskSummary),

  // ─── Clipboard Utilities (Token Paste) ────────
  readClipboardText: (): Promise<string> => ipcRenderer.invoke('read-clipboard-text'),
  writeClipboardText: (text: string): Promise<boolean> =>
    ipcRenderer.invoke('write-clipboard-text', text),
  sendApiRequest: (input: ApiRequestInput): Promise<ApiResponseOutput> =>
    ipcRenderer.invoke('api-send-request', input),
  cancelApiRequest: (id: string): void => ipcRenderer.send('api-cancel-request', id),

  // ─── Herdr-Style Swarm & Inactivity APIs ─────
  sendDesktopNotification: (options: {
    title: string
    body: string
    paneId?: string
  }): Promise<boolean> => ipcRenderer.invoke('send-desktop-notification', options),
  setKeepAwake: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('set-keep-awake', enabled),
  getKeepAwakeStatus: (): Promise<boolean> => ipcRenderer.invoke('get-keep-awake-status'),
  broadcastTerminalInput: (input: string): void => ipcRenderer.send('pty-broadcast', input),
  sendToTerminalTargets: (targetIds: string[], input: string): void =>
    ipcRenderer.send('pty-send-to-targets', { targetIds, input }),
  requestTerminalHistory: (id: string): void => ipcRenderer.send('pty-request-history', id),
  forceKillTerminal: (id: string): void => ipcRenderer.send('pty-force-kill', id),

  // ─── Developer Tools (Ports & Git) ────────────
  getListeningPorts: (): Promise<ListeningPort[]> => ipcRenderer.invoke('get-listening-ports'),
  killPortProcess: (pid: number): Promise<boolean> => ipcRenderer.invoke('kill-port-process', pid),
  getGitInfo: (cwd: string): Promise<GitBranchInfo> => ipcRenderer.invoke('get-git-info', cwd),

  // ─── Workspace Session & Google SSO ───────────
  saveWorkspaceSession: (data: unknown): Promise<boolean> =>
    ipcRenderer.invoke('save-workspace-session', data),
  loadWorkspaceSession: (): Promise<unknown> => ipcRenderer.invoke('load-workspace-session'),
  getOAuthLoopbackUrl: (providerId?: string): Promise<string> =>
    ipcRenderer.invoke('get-oauth-loopback-url', providerId),
  saveGoogleSSOCredentials: (accountId: string, email: string): Promise<boolean> =>
    ipcRenderer.invoke('save-google-sso-credentials', accountId, email),
  openGoogleLoginWindow: (
    partition: string,
    providerId: string
  ): Promise<{ success: boolean; email?: string }> =>
    ipcRenderer.invoke('open-google-login-window', partition, providerId),

  // ─── App Lifecycle ────────────────────────────
  relaunchApp: (): Promise<void> => ipcRenderer.invoke('app-restart'),
  quitApp: (): Promise<void> => ipcRenderer.invoke('app-graceful-quit'),
  forceQuitApp: (): Promise<void> => ipcRenderer.invoke('app-force-quit')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
