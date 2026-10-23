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

  // Every designated AI account receives its dedicated isolated directory.
  // Global un-isolated home CLI config is reserved strictly for System Shell ('all').
  const cfgDir =
    account.cliConfigDir ||
    (account.providerId === 'claude'
      ? `~/.claude-${account.id}`
      : account.providerId === 'chatgpt'
        ? `~/.codex-${account.id}`
        : account.providerId === 'gemini' || (account.providerId as string) === 'antigravity'
          ? `~/.gemini-${account.id}`
          : `~/.custom-${account.id}`)

  // 1. Claude / Anthropic Isolation
  if (account.providerId === 'claude' && cfgDir) {
    env.CLAUDE_CONFIG_DIR = cfgDir
    if (account.envVars?.ANTHROPIC_API_KEY) {
      env.ANTHROPIC_API_KEY = account.envVars.ANTHROPIC_API_KEY
    }
  }

  // 2. ChatGPT / OpenAI Codex Isolation
  if (account.providerId === 'chatgpt' && cfgDir) {
    env.CODEX_HOME = cfgDir
    if (account.envVars?.OPENAI_API_KEY) {
      env.OPENAI_API_KEY = account.envVars.OPENAI_API_KEY
    }
  }

  // 3. Google Gemini / Antigravity Isolation
  if (account.providerId === 'gemini' || (account.providerId as string) === 'antigravity') {
    if (cfgDir) {
      const appData = cfgDir.endsWith('/antigravity-cli') ? cfgDir : `${cfgDir}/antigravity-cli`
      env.ANTIGRAVITY_APP_DATA_DIR = appData
      env.JETSKI_APP_DATA_DIR = appData
      env.GEMINI_DIR = cfgDir
      env.GEMINI_CLI_DIR = cfgDir
    }
    if (account.googleEmail) {
      env.AGY_ACCOUNT = account.googleEmail
      env.GOOGLE_ACCOUNT = account.googleEmail
      env.CLOUDSDK_CORE_ACCOUNT = account.googleEmail
      env.GEMINI_ACCOUNT = account.googleEmail
    }
    if (account.envVars?.GEMINI_API_KEY) {
      env.GEMINI_API_KEY = account.envVars.GEMINI_API_KEY
      env.GOOGLE_API_KEY = account.envVars.GEMINI_API_KEY
      env.AUTH_MODE_GEMINI_API_KEY = '1'
    }
  }

  // 4. Custom / Generic Isolation
  if (account.providerId === 'custom' && cfgDir) {
    env.AI_CONFIG_DIR = cfgDir
  }

  return env
}

export const CHROME_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'

export const FIREFOX_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0'
