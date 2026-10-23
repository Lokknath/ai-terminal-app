import { ElectronAPI } from '@electron-toolkit/preload'

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

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      detectCLIAgents: () => Promise<
        { cmd: string; name: string; providerId: string; path: string }[]
      >
      getAIAccounts: () => Promise<AIAccount[]>
      saveAIAccount: (account: AIAccount) => Promise<boolean>
      deleteAIAccount: (id: string) => Promise<boolean>
      getCLIAccountAuth: (account: AIAccount) => Promise<CLIAccountAuth>
      getAccountUsage: (id: string) => Promise<AccountUsage | null>
      saveAccountUsage: (id: string, usage: AccountUsage | null) => Promise<boolean>
      checkPartitionWebAuth: (
        partition: string,
        providerId: string
      ) => Promise<{ isAuthenticated: boolean; cookieCount: number; userEmail?: string }>
      openExternalURL: (url: string) => Promise<boolean>
      getSystemFolders: () => Promise<SystemFolder[]>
      readDirectory: (dirPath: string) => Promise<DirectoryItem[]>
      selectDirectory: (defaultPath?: string) => Promise<string | null>
      generateHandoffState: (
        cwd: string,
        accountName?: string,
        taskSummary?: string
      ) => Promise<HandoffResult>
      readClipboardText: () => Promise<string>
      writeClipboardText: (text: string) => Promise<boolean>
      readClipboardImage: () => Promise<string | null>
      saveClipboardImageBuffer: (buffer: Uint8Array) => Promise<string | null>
      sendApiRequest: (input: ApiRequestInput) => Promise<ApiResponseOutput>
      cancelApiRequest: (id: string) => void
      sendDesktopNotification: (options: {
        title: string
        body: string
        paneId?: string
      }) => Promise<boolean>
      setKeepAwake: (enabled: boolean) => Promise<boolean>
      getKeepAwakeStatus: () => Promise<boolean>
      broadcastTerminalInput: (input: string) => void
      sendToTerminalTargets: (targetIds: string[], input: string) => void
      requestTerminalHistory: (id: string) => void
      forceKillTerminal: (id: string) => void
      getListeningPorts: () => Promise<ListeningPort[]>
      killPortProcess: (pid: number) => Promise<boolean>
      getGitInfo: (cwd: string) => Promise<GitBranchInfo>
      saveWorkspaceSession: (data: unknown) => Promise<boolean>
      loadWorkspaceSession: () => Promise<unknown>
      getOAuthLoopbackUrl: (providerId?: string) => Promise<string>
      saveGoogleSSOCredentials: (accountId: string, email: string) => Promise<boolean>
      openGoogleLoginWindow: (
        partition: string,
        providerId: string
      ) => Promise<{ success: boolean; email?: string }>
      relaunchApp: () => Promise<void>
      quitApp: () => Promise<void>
      forceQuitApp: () => Promise<void>
      onSystemResume: (cb: () => void) => () => void
      onSystemSuspend: (cb: () => void) => () => void
    }
  }
}
