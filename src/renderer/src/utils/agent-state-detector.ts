import type { AgentStatus } from '../store/AppContext'

export interface AgentDetectionResult {
  status: AgentStatus
  promptQuestion?: string
  detectedCli?: 'claude' | 'codex' | 'agy' | 'cursor' | 'copilot' | 'shell'
  lastActiveAt: number
}

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
}

// Regex matching questions where an agent pauses for user permission or choice
const WAITING_PATTERNS = [
  /allow\s+[^\r\n?]+\?/i,
  /do you want to\s+[^\r\n?]+\?/i,
  /are you sure you want to\s+[^\r\n?]+\?/i,
  /would you like to\s+[^\r\n?]+\?/i,
  /run command\s+[^\r\n?]+\?/i,
  /(?:\[|\()(?:\s*y\/n|\s*yes\/no|\s*Y\/n|\s*y\/N|\s*approve|\s*confirm|\s*allow|\s*accept)(?:\]|\))/i,
  /\b(?:\[Y\/n\]|\[y\/N\]|\(y\/n\))\b/i,
  /press (?:enter|return) to continue/i,
  /select an option:/i,
  /use arrow keys/i,
  /approval required/i,
  /requires permission/i,
  /\(y\)es\s*\/\s*\(n\)o/i,
  /enter choice:/i,
  /waiting for (?:user|confirmation|approval)/i
]

// Regex matching ongoing agent activity
const WORKING_PATTERNS = [
  /\bthinking(?:\.\.\.|\b)/i,
  /\brunning(?:\s+command)?(?::|\.\.\.)/i,
  /\bexecuting\b/i,
  /\bgenerating(?:\s+code|\s+response)?(?:\.\.\.|\b)/i,
  /\bediting file(?::|\b)/i,
  /\banalyzing(?:\s+codebase|\s+files|\s+workspace)?(?:\.\.\.|\b)/i,
  /\bsearching(?:\s+codebase|\s+files)?(?:\.\.\.|\b)/i,
  /\bfetching\b/i,
  /\bwriting to\b/i,
  /\bapplying changes\b/i
]

// Regex matching finished/completed signals
const DONE_PATTERNS = [
  /\btask completed\b/i,
  /\bdone in \d+/i,
  /\b(?:✓|✔)\s*(?:all tasks finished|completed|done)/i,
  /\bfinished in \d+/i,
  /\bwork finished\b/i
]

// Regex matching fatal error or rate-limit signals
const ERROR_PATTERNS = [
  /\brate limit reached\b/i,
  /\bquota exceeded\b/i,
  /\b429 too many requests\b/i,
  /\bfatal:\s+/i,
  /\bunhandled rejection\b/i,
  /\bexecution failed with exit code\b/i
]

function extractPromptQuestion(tailText: string): string | undefined {
  const lines = tailText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return undefined

  // Inspect the last 4 non-empty lines for the most descriptive question
  const recent = lines.slice(-4).reverse()
  for (const line of recent) {
    if (WAITING_PATTERNS.some((pattern) => pattern.test(line))) {
      // Clean and sanitize the question line
      const clean = line.replace(/^[•\->?*#]+\s*/, '').trim()
      return clean.length > 90 ? `${clean.slice(0, 87)}...` : clean
    }
  }

  const lastLine = recent[0] || ''
  return lastLine.length > 70 ? `${lastLine.slice(0, 67)}...` : lastLine
}

export function detectAgentState(
  recentOutput: string,
  currentStatus: AgentStatus = 'idle'
): AgentDetectionResult {
  const clean = stripAnsi(recentOutput)
  const now = Date.now()

  const allLines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const tail = clean.slice(-1500).trim()
  const activeTrailingLines = allLines.slice(-3).join('\n')

  // Identify CLI flavor from recent output banner or prompt
  let detectedCli: AgentDetectionResult['detectedCli'] = undefined
  if (/(?:claude(?:\.ai)?|anthropic\s+claude|claude\s+code)/i.test(tail)) detectedCli = 'claude'
  else if (/(?:openai\s+codex|codex\s+cli|\bcodex\s*>)/i.test(tail)) detectedCli = 'codex'
  else if (/(?:antigravity\s+cli|\bagy\b|\bantigravity\b)/i.test(tail)) detectedCli = 'agy'
  else if (/(?:cursor-agent|\bcursor\b)/i.test(tail)) detectedCli = 'cursor'
  else if (/(?:gh\s+copilot|copilot\s+cli)/i.test(tail)) detectedCli = 'copilot'

  // 1. Error checks in active trailing lines
  if (ERROR_PATTERNS.some((pat) => pat.test(activeTrailingLines))) {
    return {
      status: 'error',
      detectedCli,
      lastActiveAt: now
    }
  }

  // 2. Waiting check: ONLY true if the prompt is actively waiting at the tail (last 3 non-empty lines)
  if (WAITING_PATTERNS.some((pat) => pat.test(activeTrailingLines))) {
    const question = extractPromptQuestion(activeTrailingLines)
    return {
      status: 'waiting',
      promptQuestion: question,
      detectedCli,
      lastActiveAt: now
    }
  }

  // 3. Working check in active trailing lines
  if (WORKING_PATTERNS.some((pat) => pat.test(activeTrailingLines))) {
    return {
      status: 'working',
      detectedCli,
      lastActiveAt: now
    }
  }

  // 4. Done check in active trailing lines
  if (DONE_PATTERNS.some((pat) => pat.test(activeTrailingLines))) {
    return {
      status: 'done',
      detectedCli,
      lastActiveAt: now
    }
  }

  // 5. If it was working and now ends with an idle prompt (e.g. ❯, $, >, %)
  const isPromptIdle = /(?:^|\r?\n)(?:[a-zA-Z0-9_\-~@:]+[\s❯$#>%\\]\s*)$/.test(tail)
  if (isPromptIdle) {
    if (currentStatus === 'working') {
      return {
        status: 'done',
        detectedCli,
        lastActiveAt: now
      }
    }
    return {
      status: 'idle',
      detectedCli,
      lastActiveAt: now
    }
  }

  return {
    status: currentStatus === 'working' ? 'working' : 'idle',
    detectedCli,
    lastActiveAt: now
  }
}
