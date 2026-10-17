import fs from 'fs/promises'
import path from 'path'
import type { AccountUsage, UsageWindow } from './account-manager'

interface RolloutFile {
  path: string
  modifiedAt: number
}

interface RateWindow {
  used_percent?: unknown
  window_minutes?: unknown
  resets_at?: unknown
  resets_in_seconds?: unknown
}

interface RateLimits {
  limit_id?: unknown
  limit_name?: unknown
  primary?: RateWindow | null
  secondary?: RateWindow | null
}

const MAX_FILES = 24
const MAX_TAIL_BYTES = 512 * 1024

async function recentRollouts(root: string): Promise<RolloutFile[]> {
  const files: RolloutFile[] = []
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > 5) return
    let entries
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name)
        if (entry.isDirectory()) return visit(entryPath, depth + 1)
        if (!entry.isFile() || !/^rollout-.*\.jsonl$/.test(entry.name)) return
        try {
          const stat = await fs.stat(entryPath)
          files.push({ path: entryPath, modifiedAt: stat.mtimeMs })
        } catch {
          // A session can disappear while it is being listed.
        }
      })
    )
  }
  await visit(root, 0)
  return files.sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, MAX_FILES)
}

async function readTail(file: string): Promise<string> {
  const handle = await fs.open(file, 'r')
  try {
    const { size } = await handle.stat()
    const length = Math.min(size, MAX_TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, size - length)
    const text = buffer.toString('utf8')
    // A bounded tail can begin halfway through a JSONL record.
    return size > length ? text.slice(text.indexOf('\n') + 1) : text
  } finally {
    await handle.close()
  }
}

function resetTimestamp(window: RateWindow, observedAt: number): number | undefined {
  const raw = window.resets_at
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw
  }
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  if (typeof window.resets_in_seconds === 'number' && Number.isFinite(window.resets_in_seconds)) {
    return observedAt + window.resets_in_seconds * 1000
  }
  return undefined
}

function normalizeWindow(
  window: RateWindow | null | undefined,
  observedAt: number
): UsageWindow | null {
  if (!window || typeof window.used_percent !== 'number' || !Number.isFinite(window.used_percent)) {
    return null
  }
  const minutes = window.window_minutes
  const id = minutes === 300 ? 'five-hour' : minutes === 10080 ? 'weekly' : `window-${minutes}`
  const label =
    minutes === 300
      ? '5-hour limit'
      : minutes === 10080
        ? 'Weekly limit'
        : typeof minutes === 'number' && Number.isFinite(minutes)
          ? `${Math.round(minutes / 60)}-hour limit`
          : 'Usage limit'
  return {
    id,
    label,
    usedPercent: Math.max(0, Math.min(100, window.used_percent)),
    resetsAt: resetTimestamp(window, observedAt)
  }
}

/** Reads only rate-limit metadata from bounded local Codex rollout tails. */
export async function readCodexUsage(configDir: string): Promise<AccountUsage | null> {
  const files = await recentRollouts(path.join(configDir, 'sessions'))
  const buckets = new Map<string, { observedAt: number; limits: RateLimits }>()

  await Promise.all(
    files.map(async (file) => {
      try {
        for (const line of (await readTail(file.path)).split('\n')) {
          if (!line.includes('"rate_limits"')) continue
          try {
            const event = JSON.parse(line) as {
              timestamp?: string
              payload?: { type?: string; rate_limits?: RateLimits | null }
            }
            if (event.payload?.type !== 'token_count' || !event.payload.rate_limits) continue
            const observedAt = event.timestamp ? Date.parse(event.timestamp) : file.modifiedAt
            if (!Number.isFinite(observedAt)) continue
            const limits = event.payload.rate_limits
            const key = typeof limits.limit_id === 'string' ? limits.limit_id : 'codex'
            const current = buckets.get(key)
            if (!current || observedAt > current.observedAt)
              buckets.set(key, { observedAt, limits })
          } catch {
            // A partially written JSONL record should not hide earlier readings.
          }
        }
      } catch {
        // One incomplete or unreadable rollout must not hide other sessions.
      }
    })
  )

  const snapshots = [...buckets.values()].sort((a, b) => b.observedAt - a.observedAt)
  const latest = snapshots[0]
  if (!latest) return null
  const windows = snapshots
    .filter(({ observedAt }) => latest.observedAt - observedAt < 24 * 60 * 60_000)
    .flatMap(({ observedAt, limits }) => {
      const bucket =
        typeof limits.limit_name === 'string' && limits.limit_name.trim()
          ? limits.limit_name.trim().slice(0, 60)
          : typeof limits.limit_id === 'string' && limits.limit_id !== 'codex'
            ? limits.limit_id.slice(0, 60)
            : undefined
      return [limits.primary, limits.secondary]
        .map((window) => normalizeWindow(window, observedAt))
        .filter((window): window is UsageWindow => window !== null)
        .map((window) => ({
          ...window,
          id: `${bucket || 'codex'}-${window.id}`,
          bucket,
          observedAt
        }))
    })
  if (windows.length === 0) return null
  return { source: 'local-codex', observedAt: latest.observedAt, windows }
}
