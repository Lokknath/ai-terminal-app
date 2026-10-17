export type ProviderType = 'cli' | 'web'
export type ProviderTier = 'byoa' | 'web'

export interface ProviderConfig {
  id: string
  name: string
  icon: string
  type: ProviderType
  tier: ProviderTier
  description: string
  defaultUrl?: string
  cliCommand?: string
}

export const PROVIDERS: ProviderConfig[] = [
  // ─── BYOA CLI Tools ────────────────────────────
  {
    id: 'claude-cli',
    name: 'Claude Code',
    icon: '🧠',
    type: 'cli',
    tier: 'byoa',
    description: "Anthropic's agentic terminal tool for the terminal",
    cliCommand: 'claude'
  },
  {
    id: 'codex-cli',
    name: 'Codex CLI',
    icon: '🤖',
    type: 'cli',
    tier: 'byoa',
    description: "OpenAI's terminal coding agent",
    cliCommand: 'codex'
  },
  {
    id: 'agy-cli',
    name: 'Antigravity CLI',
    icon: '🚀',
    type: 'cli',
    tier: 'byoa',
    description: "Google's agentic terminal tool",
    cliCommand: 'agy'
  },
  {
    id: 'gh-copilot',
    name: 'GitHub CLI',
    icon: '🐙',
    type: 'cli',
    tier: 'byoa',
    description: 'GitHub Copilot and repository tools in the terminal',
    cliCommand: 'gh'
  },
  {
    id: 'cursor-cli',
    name: 'Cursor Agent',
    icon: '⚡',
    type: 'cli',
    tier: 'byoa',
    description: "Cursor's terminal agent for fast code intelligence",
    cliCommand: 'cursor'
  },

  // ─── Web Chat Providers ────────────────────────
  {
    id: 'claude-web',
    name: 'Claude.ai',
    icon: '🧠',
    type: 'web',
    tier: 'web',
    description: 'Use your free or Pro Claude account in an embedded browser',
    defaultUrl: 'https://claude.ai'
  },
  {
    id: 'chatgpt-web',
    name: 'ChatGPT',
    icon: '🤖',
    type: 'web',
    tier: 'web',
    description: 'Use your free or Plus ChatGPT account in an embedded browser',
    defaultUrl: 'https://chatgpt.com'
  },
  {
    id: 'gemini-web',
    name: 'Google Gemini',
    icon: '💎',
    type: 'web',
    tier: 'web',
    description: 'Use your free or Advanced Google account in an embedded browser',
    defaultUrl: 'https://gemini.google.com'
  },
  {
    id: 'brave-browser',
    name: 'Brave Browser',
    icon: '🦁',
    type: 'web',
    tier: 'web',
    description: 'Browse the web with privacy search and full internet navigation',
    defaultUrl: 'https://search.brave.com'
  }
]

export const getProvider = (id: string): ProviderConfig | undefined =>
  PROVIDERS.find((p) => p.id === id)

export const getProvidersByTier = (tier: ProviderTier): ProviderConfig[] =>
  PROVIDERS.filter((p) => p.tier === tier)
