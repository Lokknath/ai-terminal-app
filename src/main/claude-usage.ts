import { BrowserWindow, session } from 'electron'
import type { AccountUsage, UsageWindow } from './account-manager'

const CLAUDE_USAGE_URL = 'https://claude.ai/settings/usage'
const cache = new Map<string, { usage: AccountUsage; checkedAt: number }>()
const pending = new Map<string, Promise<AccountUsage | null>>()

function nextWeekday(day: number, hour: number, minute: number, now: number): number {
  const date = new Date(now)
  const daysAhead = (day - date.getDay() + 7) % 7
  date.setDate(date.getDate() + daysAhead)
  date.setHours(hour, minute, 0, 0)
  if (date.getTime() <= now) date.setDate(date.getDate() + 7)
  return date.getTime()
}

function parseResetTime(value: string, now: number): number | undefined {
  const relative = value.match(/\bin\s+(\d+)\s*(?:h|hours?)(?:\s+(\d+)\s*(?:m|minutes?))?/i)
  if (relative) return now + (Number(relative[1]) * 60 + Number(relative[2] || 0)) * 60_000

  const weekday = value.match(
    /\b(Sun(?:day)?|Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?)\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(AM|PM)\b/i
  )
  if (weekday) {
    const day = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(
      weekday[1].slice(0, 3).toLowerCase()
    )
    const hour = (Number(weekday[2]) % 12) + (weekday[4].toLowerCase() === 'pm' ? 12 : 0)
    return nextWeekday(day, hour, Number(weekday[3]), now)
  }

  const timeOnly = value.match(/^(?:at\s+)?(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (timeOnly) {
    const date = new Date(now)
    const hour = (Number(timeOnly[1]) % 12) + (timeOnly[3].toLowerCase() === 'pm' ? 12 : 0)
    date.setHours(hour, Number(timeOnly[2]), 0, 0)
    if (date.getTime() <= now) date.setDate(date.getDate() + 1)
    return date.getTime()
  }

  const parsed = Date.parse(value.replace(/^at\s+/i, ''))
  return Number.isFinite(parsed) && parsed > now ? parsed : undefined
}

function parseExpiry(value: string, now: number): number | undefined {
  const match = value.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/)
  if (!match) return undefined
  const currentYear = new Date(now).getFullYear()
  const year = match[3] ? Number(match[3]) : currentYear
  // Claude displays an expiry date without a time. Use noon IST as a stable
  // date anchor, then show the date only in the UI rather than inventing a time.
  let parsed = Date.parse(`${match[1]} ${match[2]}, ${year} 12:00:00 GMT+05:30`)
  if (!match[3] && parsed + 12 * 60 * 60_000 < now)
    parsed = Date.parse(`${match[1]} ${match[2]}, ${year + 1} 12:00:00 GMT+05:30`)
  return Number.isFinite(parsed) && parsed > now ? parsed : undefined
}

// Read only text that Claude renders on its own Settings > Usage page. We do not
// inspect its cookies or call private endpoints to infer an account's quota.
export function parseClaudeUsagePage(
  text: string,
  now = Date.now(),
  options: { fullResetEnabled?: boolean } = {}
): AccountUsage | null {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const sections: { id: string; label: string; titles: RegExp; stop: RegExp }[] = [
    {
      id: 'five-hour',
      label: '5-hour limit',
      titles: /^(Current session|5-hour (?:session|limit))$/i,
      stop: /^(This week|Weekly limits?|Limit resets)$/i
    },
    {
      id: 'weekly',
      label: 'Weekly limit',
      titles: /^(This week|Weekly limits?)$/i,
      stop: /^(Limit resets|Cloud session credits|Usage credits|This week.s usage by product)$/i
    }
  ]
  const windows: UsageWindow[] = []
  for (const section of sections) {
    const start = lines.findIndex((line) => section.titles.test(line))
    if (start < 0) continue
    const end = Math.min(lines.length, start + 12)
    const body: string[] = []
    for (let index = start + 1; index < end && !section.stop.test(lines[index]); index++) {
      body.push(lines[index])
    }
    const percent = body.join(' ').match(/\b(\d{1,3}(?:\.\d+)?)\s*%\s*used\b/i)
    if (!percent) continue
    const usedPercent = Number(percent[1])
    if (usedPercent < 0 || usedPercent > 100) continue
    const reset = body.find((line) => /^Resets?\s+/i.test(line))
    windows.push({
      id: section.id,
      label: section.label,
      usedPercent,
      resetsAt: reset ? parseResetTime(reset.replace(/^Resets?\s+/i, ''), now) : undefined
    })
  }
  if (windows.length === 0) return null

  const fullReset = lines.findIndex((line) => /\bFull reset\b/i.test(line))
  const expiryLine =
    fullReset < 0
      ? undefined
      : lines
          .slice(fullReset, fullReset + 12)
          .find((line) => /\bExpires?\s+[A-Za-z]{3,9}\s+\d{1,2}\b/i.test(line))
  const expiresAt = expiryLine ? parseExpiry(expiryLine, now) : undefined
  const fiveHourIndex = lines.findIndex((line) => /^5-hour reset$/i.test(line))
  const fullResetSection =
    fullReset < 0
      ? ''
      : lines
          .slice(fullReset + 1, fiveHourIndex > fullReset ? fiveHourIndex : fullReset + 6)
          .join(' ')
  const fullAvailable =
    fullReset < 0
      ? undefined
      : options.fullResetEnabled === true
        ? 1
        : options.fullResetEnabled === false || /\bNone right now\b/i.test(fullResetSection)
          ? 0
          : undefined
  const fiveHourSection =
    fiveHourIndex < 0 ? '' : lines.slice(fiveHourIndex + 1, fiveHourIndex + 5).join(' ')
  const explicitFiveHourCount = fiveHourSection.match(/\b(\d+)\s+(?:available|resets?)\b/i)
  const fiveHourAvailable = explicitFiveHourCount
    ? Number(explicitFiveHourCount[1])
    : /\bNone right now\b/i.test(fiveHourSection)
      ? 0
      : undefined
  const available =
    fullAvailable !== undefined && fiveHourAvailable !== undefined
      ? fullAvailable + fiveHourAvailable
      : undefined
  return {
    source: 'claude-web',
    observedAt: now,
    windows,
    resets:
      expiresAt ||
      available !== undefined ||
      fullAvailable !== undefined ||
      fiveHourAvailable !== undefined
        ? { available, fullAvailable, fiveHourAvailable, expiresAt }
        : undefined
  }
}

async function readFromWebSession(partition: string): Promise<AccountUsage | null> {
  const ses = session.fromPartition(partition)
  const cookies = await ses.cookies.get({ name: 'sessionKey' })
  if (
    !cookies.some((cookie) => /(^|\.)claude\.ai$/i.test((cookie.domain || '').replace(/^\./, '')))
  ) {
    return null
  }

  const window = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    width: 900,
    height: 800,
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, destination) => {
    try {
      if (new URL(destination).origin === 'https://claude.ai') return
    } catch {
      // Do not allow the background reader to leave Claude's origin.
    }
    event.preventDefault()
  })

  const deadline = Date.now() + 15_000
  let loadTimer: ReturnType<typeof setTimeout> | undefined
  let firstReadingAt: number | undefined
  let latestUsage: AccountUsage | null = null
  try {
    await Promise.race([
      window.loadURL(CLAUDE_USAGE_URL),
      new Promise<never>((_, reject) => {
        loadTimer = setTimeout(() => reject(new Error('Claude usage page timed out')), 12_000)
      })
    ])
    while (!window.isDestroyed() && Date.now() < deadline) {
      const snapshot = (await window.webContents.executeJavaScript(
        `(() => {
        if (location.origin !== 'https://claude.ai' ||
            !(location.pathname === '/settings/usage' || location.hash.includes('settings/usage'))) return { text: '' };
        const fullResetButton = [...document.querySelectorAll('button')]
          .find(button => /Reset for free/i.test(button.textContent || ''));
        return {
          text: (document.body?.innerText || '').slice(0, 30000),
          fullResetEnabled: fullResetButton ? !fullResetButton.disabled : undefined
        };
      })()`,
        true
      )) as { text: string; fullResetEnabled?: boolean }
      const usage = parseClaudeUsagePage(snapshot.text, Date.now(), snapshot)
      if (usage) {
        firstReadingAt ??= Date.now()
        latestUsage = usage
        // Reset offers can appear after the progress bars on Claude's page.
        if (
          (usage.resets?.expiresAt && usage.resets?.available !== undefined) ||
          Date.now() - firstReadingAt >= 2_000
        )
          return usage
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    return latestUsage
  } finally {
    if (loadTimer) clearTimeout(loadTimer)
    if (!window.isDestroyed()) window.destroy()
  }
}

export function readClaudeUsage(partition: string): Promise<AccountUsage | null> {
  if (!/^persist:[a-zA-Z0-9_-]+$/.test(partition)) return Promise.resolve(null)
  const cached = cache.get(partition)
  if (cached && Date.now() - cached.checkedAt < 60_000) return Promise.resolve(cached.usage)
  const inFlight = pending.get(partition)
  if (inFlight) return inFlight
  const task = readFromWebSession(partition)
    .then((usage) => {
      if (usage) cache.set(partition, { usage, checkedAt: Date.now() })
      return usage
    })
    .catch((error) => {
      console.warn('Could not read Claude usage page:', error)
      return null
    })
    .finally(() => pending.delete(partition))
  pending.set(partition, task)
  return task
}
