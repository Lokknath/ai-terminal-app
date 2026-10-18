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
  profileDir?: string
  googleEmail?: string
  isDefault?: boolean
  usage?: AccountUsage
  envVars?: Record<string, string>
  createdAt: number
}

export interface DetectedCLI {
  cmd: string
  name: string
  providerId: string
  path: string
}

export interface DirectoryItem {
  name: string
  path: string
  hasChildren: boolean
  isDirectory?: boolean
  size?: number
  updatedAt?: number
}

export interface SystemFolder {
  name: string
  path: string
  icon: string
}

export interface CLIAccountAuth {
  loggedIn: boolean
  email?: string
  subscriptionType?: string
  authMethod?: string
  configDir?: string
  usage?: AccountUsage
}

export interface HandoffResult {
  success: boolean
  handoffPath: string
  gitStatus: string
  gitDiff: string
  prompt: string
}

export function getProviderCliLoginCommand(providerId: string, _account?: AIAccount): string {
  void _account
  // The terminal receives its profile in the spawn environment. Keep shell commands
  // free of user-supplied paths so profile names cannot become shell syntax.
  switch (providerId) {
    case 'claude':
      return 'claude auth login'
    case 'chatgpt':
      return 'codex login'
    case 'gemini':
    case 'antigravity':
      return 'agy'
    default:
      return ''
  }
}

export function getProviderCliCommand(providerId: string, _account?: AIAccount): string {
  void _account
  switch (providerId) {
    case 'claude':
      return 'claude'
    case 'chatgpt':
      return 'codex'
    case 'gemini':
    case 'antigravity':
      return 'agy'
    default:
      return ''
  }
}

export function getAccountEnv(account?: AIAccount): Record<string, string> {
  if (!account) return {}
  const env: Record<string, string> = { ...(account.envVars || {}) }

  const isPrimary =
    Boolean(account.isDefault) ||
    account.id.includes('default') ||
    account.id.includes('main') ||
    account.name.toLowerCase().includes('main') ||
    account.name.toLowerCase().includes('personal')

  // For secondary/custom profiles, point to isolated directory.
  // For primary/default profiles, leave unset so it uses user's authenticated global home CLI config.
  if (account.providerId === 'claude') {
    if (account.cliConfigDir && !isPrimary) {
      env.CLAUDE_CONFIG_DIR = account.cliConfigDir
    } else if (!isPrimary) {
      env.CLAUDE_CONFIG_DIR = `~/.claude-${account.id}`
    }
  } else if (account.providerId === 'chatgpt') {
    if (account.cliConfigDir && !isPrimary) {
      env.CODEX_HOME = account.cliConfigDir
    } else if (!isPrimary) {
      env.CODEX_HOME = `~/.codex-${account.id}`
    }
  } else if (account.providerId === 'gemini' || (account.providerId as string) === 'antigravity') {
    if (account.cliConfigDir && !isPrimary) {
      const cfg = account.cliConfigDir
      env.ANTIGRAVITY_APP_DATA_DIR = cfg.endsWith('/antigravity-cli')
        ? cfg
        : `${cfg}/antigravity-cli`
      env.GEMINI_DIR = cfg
      env.GEMINI_CLI_DIR = cfg
    } else if (!isPrimary) {
      const profileDir = `~/.gemini-${account.id}`
      env.ANTIGRAVITY_APP_DATA_DIR = `${profileDir}/antigravity-cli`
      env.GEMINI_DIR = profileDir
      env.GEMINI_CLI_DIR = profileDir
    }
  }

  return env
}

export const CHROME_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'

export const FIREFOX_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0'
