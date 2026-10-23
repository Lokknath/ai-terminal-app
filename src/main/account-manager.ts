import { ipcMain, app, session, safeStorage, BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { readCodexUsage } from './usage-limits'
import { readClaudeUsage } from './claude-usage'
import { getSystemPath } from './agent-registry'
import { getOAuthLoopbackUrl, setOAuthCallbackListener } from './oauth-server'

const execFilePromise = promisify(execFile)

export interface UsageWindow {
  id: string
  label: string
  bucket?: string
  usedPercent?: number
  resetsAt?: number
  observedAt?: number
}

export interface AccountUsage {
  usedTokens?: number
  limitTokens?: number
  quotaPercent?: number
  requestsRemaining?: number
  resetsAt?: string | number
  tier?: string
  windows?: UsageWindow[]
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

const DEFAULT_ACCOUNTS: AIAccount[] = [
  {
    id: 'claude-default',
    providerId: 'claude',
    name: 'Claude.ai (Main)',
    url: 'https://claude.ai',
    partition: 'persist:account-claude-default',
    isDefault: true,
    createdAt: Date.now()
  },
  {
    id: 'chatgpt-default',
    providerId: 'chatgpt',
    name: 'ChatGPT (Main)',
    url: 'https://chatgpt.com',
    partition: 'persist:account-chatgpt-default',
    isDefault: true,
    createdAt: Date.now()
  },
  {
    id: 'gemini-default',
    providerId: 'gemini',
    name: 'Gemini (Main)',
    url: 'https://gemini.google.com',
    partition: 'persist:account-gemini-default',
    isDefault: true,
    createdAt: Date.now()
  },
  {
    id: 'brave-browser-default',
    providerId: 'custom',
    name: 'Brave Browser',
    url: 'https://search.brave.com',
    partition: 'persist:account-brave-default',
    createdAt: Date.now()
  }
]

function getAccountsFile(): string {
  return path.join(app.getPath('userData'), 'ai-accounts.json')
}

type StoredAccount = Omit<AIAccount, 'envVars'> & {
  envVars?: Record<string, string> // Legacy accounts are migrated on the next write.
  envVarsEncrypted?: string
}

let mutationQueue: Promise<unknown> = Promise.resolve()

function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation, operation)
  mutationQueue = result.catch(() => undefined)
  return result
}

export async function readAccounts(): Promise<AIAccount[]> {
  try {
    const file = getAccountsFile()
    if (fs.existsSync(file)) {
      // Account metadata can contain old plaintext env vars. Restrict even a legacy file.
      fs.chmodSync(file, 0o600)
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
      if (Array.isArray(data)) {
        const accounts = await Promise.all(
          data.map(async (acc: StoredAccount) => {
            let cliConfigDir = acc.cliConfigDir
            if (cliConfigDir && cliConfigDir.includes('gcloud')) {
              cliConfigDir = cliConfigDir.replace('gcloud', 'gemini')
            }
            let envVars = acc.envVars
            if (acc.envVarsEncrypted) {
              const encrypted = Buffer.from(acc.envVarsEncrypted, 'base64')
              const decrypted = await safeStorage.decryptStringAsync(encrypted)
              envVars = JSON.parse(decrypted.result) as Record<string, string>
            }
            const { envVarsEncrypted: _encrypted, ...account } = acc
            void _encrypted
            return {
              ...account,
              cliConfigDir,
              envVars
            }
          })
        )

        // Ensure each AI provider has at least one account marked default
        const providers = ['gemini', 'claude', 'chatgpt'] as const
        for (const prov of providers) {
          const provAccounts = accounts.filter((a) => a.providerId === prov)
          if (provAccounts.length > 0 && !provAccounts.some((a) => a.isDefault)) {
            provAccounts[0].isDefault = true
          }
        }

        return accounts
      }
    }
  } catch (err) {
    console.error('Error reading accounts file:', err)
  }
  // An empty saved list is intentional. Only seed defaults for a new installation.
  if (!fs.existsSync(getAccountsFile())) {
    await writeAccounts(DEFAULT_ACCOUNTS)
    return DEFAULT_ACCOUNTS
  }
  throw new Error('Could not read saved AI accounts. The file was left unchanged.')
}

export async function writeAccounts(accounts: AIAccount[]): Promise<void> {
  const file = getAccountsFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporaryFile = `${file}.tmp`
  const stored: StoredAccount[] = await Promise.all(
    accounts.map(async (account) => {
      const { envVars, ...metadata } = account
      if (!envVars || Object.keys(envVars).length === 0) return metadata
      if (
        !(await safeStorage.isAsyncEncryptionAvailable()) ||
        (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
      ) {
        throw new Error(
          'Secure OS storage is unavailable; account environment values were not saved.'
        )
      }
      const encrypted = await safeStorage.encryptStringAsync(JSON.stringify(envVars))
      return { ...metadata, envVarsEncrypted: encrypted.toString('base64') }
    })
  )
  fs.writeFileSync(temporaryFile, JSON.stringify(stored, null, 2), {
    encoding: 'utf-8',
    mode: 0o600
  })
  fs.chmodSync(temporaryFile, 0o600)
  fs.renameSync(temporaryFile, file)
}

export function getAccountCLIConfigDir(account: AIAccount): string {
  const home = app.getPath('home')

  if (account.cliConfigDir) {
    if (account.cliConfigDir === '~') return home
    if (account.cliConfigDir.startsWith('~/')) return path.join(home, account.cliConfigDir.slice(2))
    return account.cliConfigDir
  }

  // Every account is isolated to its own designated profile folder
  if (account.providerId === 'claude') {
    return path.join(home, `.claude-${account.id}`)
  }

  if (account.providerId === 'chatgpt') {
    return path.join(home, `.codex-${account.id}`)
  }

  if (account.providerId === 'gemini' || (account.providerId as string) === 'antigravity') {
    return path.join(home, `.gemini-${account.id}`)
  }

  return path.join(home, `.custom-${account.id}`)
}

interface JwtClaims {
  email?: string
  'https://api.openai.com/profile'?: { email?: string }
  'https://api.openai.com/auth'?: { chatgpt_plan_type?: string }
  [key: string]: unknown
}

function parseJwtPayload(token?: string): JwtClaims | null {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length >= 2) {
      return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8')) as JwtClaims
    }
  } catch {
    /* ignore */
  }
  return null
}

export function initAccountManager(): void {
  ipcMain.handle('get-account-usage', async (_event, id: string): Promise<AccountUsage | null> => {
    if (typeof id !== 'string') return null
    const account = (await readAccounts()).find((item) => item.id === id)
    if (!account) return null
    if (account.providerId === 'chatgpt') return readCodexUsage(getAccountCLIConfigDir(account))
    if (account.providerId === 'claude') return readClaudeUsage(account.partition)
    return null
  })

  ipcMain.handle('save-account-usage', (_event, id: string, input: unknown) =>
    serializeMutation(async () => {
      if (typeof id !== 'string') return false
      const accounts = await readAccounts()
      const account = accounts.find((item) => item.id === id)
      if (!account) return false
      if (input === null) {
        delete account.usage
      } else {
        if (!input || typeof input !== 'object') return false
        const candidate = input as AccountUsage
        const allowed = new Set(['five-hour', 'weekly', 'daily'])
        const windows = Array.isArray(candidate.windows)
          ? candidate.windows
              .filter(
                (window) =>
                  window &&
                  typeof window === 'object' &&
                  allowed.has(window.id) &&
                  typeof window.usedPercent === 'number' &&
                  Number.isFinite(window.usedPercent) &&
                  window.usedPercent >= 0 &&
                  window.usedPercent <= 100 &&
                  (window.resetsAt === undefined ||
                    (typeof window.resetsAt === 'number' && Number.isFinite(window.resetsAt)))
              )
              .slice(0, 3)
              .map((window) => ({
                id: window.id,
                label:
                  window.id === 'five-hour'
                    ? '5-hour limit'
                    : window.id === 'weekly'
                      ? 'Weekly limit'
                      : 'Daily limit',
                usedPercent: window.usedPercent,
                resetsAt: window.resetsAt
              }))
          : []
        const available = candidate.resets?.available
        const expiresAt = candidate.resets?.expiresAt
        if (
          (available !== undefined &&
            (!Number.isInteger(available) || available < 0 || available > 100)) ||
          (expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt < 0))
        ) {
          return false
        }
        account.usage = {
          source: 'manual',
          observedAt: Date.now(),
          windows,
          resets: { available, expiresAt }
        }
      }
      await writeAccounts(accounts)
      return true
    })
  )
  ipcMain.handle('get-ai-accounts', () => readAccounts())

  ipcMain.handle('save-ai-account', (_event, account: AIAccount) =>
    serializeMutation(async () => {
      if (
        !account ||
        typeof account.id !== 'string' ||
        typeof account.name !== 'string' ||
        !account.name.trim() ||
        typeof account.partition !== 'string' ||
        !/^persist:[a-zA-Z0-9_-]+$/.test(account.partition)
      ) {
        throw new Error('Account details are incomplete or invalid')
      }
      try {
        const url = new URL(account.url)
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error()
      } catch {
        throw new Error('Account website must be a valid HTTP or HTTPS address')
      }
      const accounts = await readAccounts()
      const index = accounts.findIndex((a) => a.id === account.id)

      // If marked default, clear default from other accounts of the SAME provider
      if (account.isDefault) {
        accounts.forEach((a) => {
          if (a.providerId === account.providerId && a.id !== account.id) {
            a.isDefault = false
          }
        })
      }

      if (index >= 0) {
        accounts[index] = account
      } else {
        accounts.push(account)
      }
      await writeAccounts(accounts)
      return true
    })
  )

  ipcMain.handle('delete-ai-account', (_event, id: string) =>
    serializeMutation(async () => {
      const accounts = (await readAccounts()).filter((a) => a.id !== id)
      // Ensure each provider retains a default account
      const providers = ['gemini', 'claude', 'chatgpt'] as const
      for (const prov of providers) {
        const provAccounts = accounts.filter((a) => a.providerId === prov)
        if (provAccounts.length > 0 && !provAccounts.some((a) => a.isDefault)) {
          provAccounts[0].isDefault = true
        }
      }
      await writeAccounts(accounts)
      return true
    })
  )

  // Detect CLI Google/OAuth auth status & usage asynchronously without blocking UI thread
  ipcMain.handle(
    'get-cli-account-auth',
    async (_event, account: AIAccount): Promise<CLIAccountAuth> => {
      const cfgDir = getAccountCLIConfigDir(account)
      const home = app.getPath('home')
      const isDefaultDir =
        cfgDir === path.join(home, '.claude') ||
        cfgDir === path.join(home, '.codex') ||
        cfgDir === path.join(home, '.gemini')

      const envPath = getSystemPath()

      if (account.providerId === 'claude') {
        // Prefer the CLI's own answer. A credential file alone cannot prove that
        // its token is still accepted by the provider.
        try {
          const { stdout, stderr } = await execFilePromise('claude', ['auth', 'status'], {
            timeout: 8000,
            encoding: 'utf-8',
            env: {
              ...process.env,
              PATH: envPath,
              ...(isDefaultDir ? {} : { CLAUDE_CONFIG_DIR: cfgDir })
            }
          }).catch((err) => ({ stdout: err.stdout || '', stderr: err.stderr || '' }))
          const jsonMatch = `${stdout}\n${stderr}`.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            return {
              loggedIn: !!parsed.loggedIn,
              email: parsed.email,
              subscriptionType: parsed.subscriptionType,
              authMethod: 'claude-cli',
              configDir: cfgDir
            }
          }
        } catch {
          // Fall back to local profile detection when the CLI is unavailable.
        }

        // Fast disk inspection fallback (0ms)
        const possibleJsonPaths = [
          path.join(cfgDir, '.claude.json'),
          path.join(cfgDir, 'claude.json'),
          isDefaultDir ? path.join(home, '.claude.json') : null
        ].filter(Boolean) as string[]

        for (const p of possibleJsonPaths) {
          try {
            if (fs.existsSync(p)) {
              const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'))
              if (parsed.oauthAccount?.emailAddress) {
                const subType = parsed.oauthAccount?.seatTier || 'Pro'
                return {
                  loggedIn: true,
                  email: parsed.oauthAccount.emailAddress,
                  subscriptionType: subType,
                  authMethod: 'profile-detected',
                  configDir: cfgDir
                }
              }
            }
          } catch {
            /* ignore read error */
          }
        }

        return { loggedIn: false, configDir: cfgDir }
      }

      if (account.providerId === 'chatgpt') {
        // Ensure CODEX_HOME directory exists so codex never crashes with path missing
        try {
          fs.mkdirSync(cfgDir, { recursive: true })
        } catch {
          /* ignore */
        }

        try {
          const { stdout, stderr } = await execFilePromise('codex', ['login', 'status'], {
            timeout: 8000,
            encoding: 'utf-8',
            env: { ...process.env, PATH: envPath, ...(isDefaultDir ? {} : { CODEX_HOME: cfgDir }) }
          }).catch((err) => ({ stdout: err.stdout || '', stderr: err.stderr || '' }))
          const status = `${stdout}\n${stderr}`
          if (/\b(?:not )?logged in\b/i.test(status)) {
            const loggedIn = /\blogged in\b/i.test(status) && !/\bnot logged in\b/i.test(status)
            return {
              loggedIn,
              email: loggedIn ? 'Codex account' : undefined,
              configDir: cfgDir,
              subscriptionType: loggedIn ? 'Codex account' : undefined,
              authMethod: 'codex-cli'
            }
          }
        } catch {
          // Fall back to local profile detection when the CLI is unavailable.
        }

        // Fast disk inspection for auth.json (0ms)
        const authJsonPath = path.join(cfgDir, 'auth.json')
        const globalAuthJson = isDefaultDir ? path.join(home, '.codex', 'auth.json') : null
        for (const p of [authJsonPath, globalAuthJson].filter(Boolean) as string[]) {
          try {
            if (fs.existsSync(p)) {
              const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
              const token = data.tokens?.id_token || data.tokens?.access_token
              const payload = parseJwtPayload(token)
              if (payload) {
                const email =
                  payload.email ||
                  payload['https://api.openai.com/profile']?.email ||
                  'ChatGPT User'
                const plan = payload['https://api.openai.com/auth']?.chatgpt_plan_type || 'Plus'
                return {
                  loggedIn: true,
                  email,
                  configDir: cfgDir,
                  subscriptionType: `ChatGPT ${plan}`,
                  authMethod: 'profile-detected'
                }
              }
            }
          } catch {
            /* ignore read error */
          }
        }

        return { loggedIn: false, configDir: cfgDir }
      }

      if (account.providerId === 'gemini' || (account.providerId as string) === 'antigravity') {
        const isPrimary = Boolean(account.isDefault)

        // 1. If the account already has an authenticated Google SSO email, report it
        if (account.googleEmail) {
          return {
            loggedIn: true,
            email: account.googleEmail,
            configDir: cfgDir,
            subscriptionType: 'Gemini Advanced',
            authMethod: 'google-sso'
          }
        }

        // 2. Check if the account has an API key configured
        if (account.envVars?.GEMINI_API_KEY) {
          return {
            loggedIn: true,
            email: 'API Key Configured',
            configDir: cfgDir,
            subscriptionType: 'Gemini API Key',
            authMethod: 'api-key'
          }
        }

        // 3. Check if the account's partition has active Google/Gemini session cookies
        if (account.partition) {
          try {
            const ses = session.fromPartition(account.partition)
            const cookies = await ses.cookies.get({})
            const hasGoogleAuth = cookies.some(
              (c) =>
                (c.name === '__Secure-1PSID' || c.name === 'SID' || c.name === 'SSID') &&
                c.domain &&
                c.domain.includes('google.com')
            )
            if (hasGoogleAuth) {
              let detectedEmail: string | undefined
              for (const c of cookies) {
                if (c.value) {
                  const m = c.value.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)
                  if (m && !m[1].endsWith('google.com') && !m[1].endsWith('gstatic.com') && !m[1].endsWith('googleapis.com')) {
                    detectedEmail = m[1]
                    break
                  }
                }
              }

              const resolvedEmail =
                detectedEmail || (isPrimary ? 'Gemini (Active Session)' : `${account.name} (Active)`)

              // Persist detected email to account store
              if (detectedEmail && detectedEmail !== account.googleEmail) {
                void serializeMutation(async () => {
                  const accs = await readAccounts()
                  const acc = accs.find((a) => a.id === account.id)
                  if (acc) {
                    acc.googleEmail = detectedEmail
                    await writeAccounts(accs)
                  }
                })
              }

              return {
                loggedIn: true,
                email: resolvedEmail,
                configDir: cfgDir,
                subscriptionType: 'Gemini Advanced (Google Auth)',
                authMethod: 'google-sso'
              }
            }
          } catch {
            /* ignore session check error */
          }
        }

        // 4. Check for Antigravity / Gemini CLI profile on disk in this account's directory
        const profileSettings = [
          path.join(cfgDir, '.gemini', 'antigravity-cli', 'settings.json'),
          path.join(cfgDir, '.gemini', 'antigravity-cli', 'jetski_state.pbtxt'),
          path.join(cfgDir, 'antigravity-cli', 'settings.json'),
          path.join(cfgDir, 'antigravity-cli', 'jetski_state.pbtxt'),
          path.join(cfgDir, 'settings.json'),
          path.join(cfgDir, 'credentials.json'),
          path.join(cfgDir, 'oauth_credentials.json'),
          ...(isDefaultDir
            ? [
                path.join(home, '.gemini', 'antigravity-cli', 'settings.json'),
                path.join(home, '.gemini', 'antigravity-cli', 'jetski_state.pbtxt'),
                path.join(home, '.gemini', 'settings.json'),
                path.join(home, '.gemini', 'credentials.json'),
                path.join(home, '.gemini', 'oauth_credentials.json')
              ]
            : [])
        ]
        const hasProfile = profileSettings.some((f) => fs.existsSync(f))

        if (hasProfile) {
          return {
            loggedIn: true,
            email: account.googleEmail || `${account.name} (Active)`,
            configDir: cfgDir,
            subscriptionType: 'Gemini Subscription',
            authMethod: 'profile-detected'
          }
        }

        return {
          loggedIn: false,
          configDir: cfgDir
        }
      }

      return { loggedIn: false, configDir: cfgDir }
    }
  )

  // Check if Web Chat partition has active session cookies
  ipcMain.handle(
    'check-partition-web-auth',
    async (_event, partition: string, providerId: string) => {
      try {
        if (!/^persist:[a-zA-Z0-9_-]+$/.test(partition)) {
          return { isAuthenticated: false, cookieCount: 0 }
        }
        const ses = session.fromPartition(partition)
        const cookies = await ses.cookies.get({})
        let isAuthenticated = false
        let userEmail: string | undefined
        const onDomain = (domain: string | undefined, host: string): boolean => {
          const normalized = (domain || '').replace(/^\./, '').toLowerCase()
          return normalized === host || normalized.endsWith(`.${host}`)
        }

        if (providerId === 'claude') {
          isAuthenticated = cookies.some(
            (c) => c.name === 'sessionKey' && onDomain(c.domain, 'claude.ai')
          )
        } else if (providerId === 'chatgpt') {
          isAuthenticated = cookies.some(
            (c) =>
              c.name.includes('session-token') &&
              (onDomain(c.domain, 'chatgpt.com') || onDomain(c.domain, 'openai.com'))
          )
        } else if (providerId === 'gemini') {
          isAuthenticated = cookies.some(
            (c) =>
              (c.name === '__Secure-1PSID' || c.name === 'SID' || c.name === 'SSID') && onDomain(c.domain, 'google.com')
          )
          if (isAuthenticated) {
            for (const c of cookies) {
              if (c.value) {
                const m = c.value.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)
                if (m && !m[1].endsWith('google.com') && !m[1].endsWith('gstatic.com') && !m[1].endsWith('googleapis.com')) {
                  userEmail = m[1]
                  break
                }
              }
            }
            // Auto-persist detected email to account if partition matches
            if (userEmail) {
              const detected = userEmail
              void serializeMutation(async () => {
                const accs = await readAccounts()
                const acc = accs.find((a) => a.partition === partition)
                if (acc && acc.googleEmail !== detected) {
                  acc.googleEmail = detected
                  await writeAccounts(accs)
                }
              })
            }
          }
        }

        return { isAuthenticated, cookieCount: cookies.length, userEmail }
      } catch {
        return { isAuthenticated: false, cookieCount: 0 }
      }
    }
  )

  // Disk-backed workspace session persistence across system/app restarts
  const getWorkspaceSessionFile = (): string => {
    return path.join(app.getPath('userData'), 'workspace-session.json')
  }

  ipcMain.handle('save-workspace-session', async (_event, data: unknown) => {
    try {
      if (!data || typeof data !== 'object') return false
      const file = getWorkspaceSessionFile()
      const temporaryFile = `${file}.tmp`
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(temporaryFile, JSON.stringify(data, null, 2), 'utf-8')
      fs.renameSync(temporaryFile, file)
      return true
    } catch (err) {
      console.error('[Session Storage] Failed to save workspace session to disk:', err)
      return false
    }
  })

  ipcMain.handle('load-workspace-session', async () => {
    try {
      const file = getWorkspaceSessionFile()
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf-8'))
      }
      return null
    } catch {
      return null
    }
  })

  // External loopback URL generator
  ipcMain.handle('get-oauth-loopback-url', (_e, providerId?: string) => {
    return getOAuthLoopbackUrl(typeof providerId === 'string' ? providerId : 'gemini')
  })

  // Save Google SSO Credentials
  ipcMain.handle(
    'save-google-sso-credentials',
    async (_event, accountId: string, email: string) => {
      return serializeMutation(async () => {
        const accounts = await readAccounts()
        const target =
          accounts.find((a) => a.id === accountId) ||
          (accountId ? null : accounts.find((a) => a.providerId === 'gemini'))
        if (target) {
          target.googleEmail = email
          await writeAccounts(accounts)
          return true
        }
        return false
      })
    }
  )

  // Dedicated In-App Google Sign-In Window with Session Partition
  ipcMain.handle(
    'open-google-login-window',
    async (_event, partition: string, providerId: string) => {
      return new Promise<{ success: boolean; email?: string }>((resolve) => {
        try {
          const targetPartition = partition || 'persist:account-gemini-default'
          const authWin = new BrowserWindow({
            width: 540,
            height: 700,
            show: true,
            title: 'Sign in with Google - Nexus AI Terminal',
            webPreferences: {
              partition: targetPartition,
              contextIsolation: true,
              sandbox: true
            }
          })

          let resolved = false
          let typedEmail: string | undefined = undefined

          const checkSuccess = async (): Promise<void> => {
            if (resolved) return
            try {
              const ses = session.fromPartition(targetPartition)
              const cookies = await ses.cookies.get({})
              const hasAuth = cookies.some(
                (c) =>
                  (c.name === '__Secure-1PSID' || c.name === 'SID' || c.name === 'SSID') &&
                  c.domain &&
                  c.domain.includes('google.com')
              )

              if (hasAuth) {
                resolved = true
                let email: string | undefined = undefined

                // 1. Try DOM inspection within the authenticated webContents
                try {
                  const domEmail = await authWin.webContents.executeJavaScript(`
                    (() => {
                      try {
                        const links = Array.from(document.querySelectorAll('a[aria-label*="@"], button[aria-label*="@"], div[aria-label*="@"]'));
                        for (const el of links) {
                          const label = el.getAttribute('aria-label') || '';
                          const m = label.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/);
                          if (m && !m[1].endsWith('google.com')) return m[1];
                        }
                        const idEls = Array.from(document.querySelectorAll('[data-email], [data-identifier], [title*="@"]'));
                        for (const el of idEls) {
                          const val = el.getAttribute('data-email') || el.getAttribute('data-identifier') || el.getAttribute('title') || '';
                          const m = val.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/);
                          if (m && !m[1].endsWith('google.com')) return m[1];
                        }
                        const imgs = Array.from(document.querySelectorAll('img[alt*="@"]'));
                        for (const img of imgs) {
                          const alt = img.getAttribute('alt') || '';
                          const m = alt.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/);
                          if (m && !m[1].endsWith('google.com')) return m[1];
                        }
                        if (window.WIZ_global_data) {
                          const str = JSON.stringify(window.WIZ_global_data);
                          const m = str.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/);
                          if (m && !m[1].endsWith('google.com') && !m[1].endsWith('gstatic.com') && !m[1].endsWith('googleapis.com')) return m[1];
                        }
                        return null;
                      } catch {
                        return null;
                      }
                    })()
                  `)
                  if (domEmail && typeof domEmail === 'string') {
                    email = domEmail
                  }
                } catch {
                  /* ignore DOM eval error */
                }

                // 2. Try ACCOUNT_CHOOSER cookie
                if (!email) {
                  const chooser = cookies.find((c) => c.name === 'ACCOUNT_CHOOSER')
                  if (chooser?.value) {
                    const match = chooser.value.match(
                      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
                    )
                    if (match) email = match[1]
                  }
                }

                // 3. Fallback to typed identifier entered during login
                if (!email && typedEmail) {
                  email = typedEmail
                }

                // If email detected, persist it immediately before resolving
                if (email) {
                  const detected = email
                  await serializeMutation(async () => {
                    const accs = await readAccounts()
                    const acc =
                      accs.find((a) => a.partition === targetPartition) ||
                      (targetPartition ? null : accs.find((a) => a.providerId === 'gemini'))
                    if (acc) {
                      acc.googleEmail = detected
                      await writeAccounts(accs)
                    }
                  })
                }

                setTimeout(() => {
                  if (!authWin.isDestroyed()) authWin.close()
                }, 1000)
                resolve({ success: true, email })
              }
            } catch {
              /* ignore check error */
            }
          }

          const inspectInput = async (): Promise<void> => {
            try {
              const val = await authWin.webContents.executeJavaScript(`
                (() => {
                  const input = document.querySelector('input[type="email"], #identifierId, input[name="identifier"]');
                  return input ? input.value : null;
                })()
              `)
              if (val && typeof val === 'string' && val.includes('@')) {
                typedEmail = val.trim()
              }
            } catch {
              /* ignore */
            }
          }

          authWin.webContents.on('did-navigate', (_e, url) => {
            void inspectInput()
            if (
              url.includes('myaccount.google.com') ||
              url.includes('gemini.google.com') ||
              url.includes('accounts.google.com/ManageAccount') ||
              url.includes('google.com/search')
            ) {
              void checkSuccess()
            }
          })

          authWin.webContents.on('did-finish-load', () => {
            void inspectInput()
            void checkSuccess()
          })

          authWin.on('closed', () => {
            if (!resolved) {
              resolved = true
              resolve({ success: false })
            }
          })

          const startUrl =
            providerId === 'gemini'
              ? 'https://accounts.google.com/signin/v2/identifier?service=googleplay&continue=https%3A%2F%2Fgemini.google.com'
              : 'https://accounts.google.com/signin'
          void authWin.loadURL(startUrl)
        } catch {
          resolve({ success: false })
        }
      })
    }
  )

  // Listen to external OAuth callbacks caught by the local loopback server
  setOAuthCallbackListener((payload) => {
    if (payload.email) {
      void serializeMutation(async () => {
        const accs = await readAccounts()
        const target =
          (payload.accountId && accs.find((a) => a.id === payload.accountId)) ||
          accs.find((a) => a.providerId === payload.providerId)
        if (target) {
          target.googleEmail = payload.email
          await writeAccounts(accs)
        }
      })
    }
  })
}
