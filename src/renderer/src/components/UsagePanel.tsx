import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Clock3, RefreshCw, Save, X, Activity, CircleAlert } from 'lucide-react'
import { useApp } from '../store/AppContext'
import type { AccountUsage, AIAccount } from '../types'

interface UsagePanelProps {
  onOpenAccount?: (account: { url: string; name: string; partition: string }) => void
}

interface Draft {
  fiveHourPercent: string
  fiveHourReset: string
  weeklyPercent: string
  weeklyReset: string
  dailyPercent: string
  dailyReset: string
  resetsAvailable: string
  resetsExpires: string
}

const EMPTY_DRAFT: Draft = {
  fiveHourPercent: '',
  fiveHourReset: '',
  weeklyPercent: '',
  weeklyReset: '',
  dailyPercent: '',
  dailyReset: '',
  resetsAvailable: '',
  resetsExpires: ''
}

const usageUrls: Partial<Record<AIAccount['providerId'], string>> = {
  claude: 'https://claude.ai/settings/usage',
  chatgpt: 'https://chatgpt.com/codex/cloud/settings/usage'
}

function dateInput(timestamp?: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) return ''
  const date = new Date(timestamp)
  const local = new Date(timestamp - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function draftFrom(usage?: AccountUsage): Draft {
  const find = (id: string): NonNullable<AccountUsage['windows']>[number] | undefined =>
    usage?.windows?.find((window) => window.id === id)
  return {
    fiveHourPercent: find('five-hour')?.usedPercent?.toString() || '',
    fiveHourReset: dateInput(find('five-hour')?.resetsAt),
    weeklyPercent: find('weekly')?.usedPercent?.toString() || '',
    weeklyReset: dateInput(find('weekly')?.resetsAt),
    dailyPercent: find('daily')?.usedPercent?.toString() || '',
    dailyReset: dateInput(find('daily')?.resetsAt),
    resetsAvailable: usage?.resets?.available?.toString() || '',
    resetsExpires: dateInput(usage?.resets?.expiresAt)
  }
}

function relativeTime(timestamp: number, now: number): string {
  const minutes = Math.round(Math.abs(now - timestamp) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ${timestamp > now ? 'from now' : 'ago'}`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ${timestamp > now ? 'from now' : 'ago'}`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp)
}

function istTime(timestamp: number, dateOnly = false): string {
  return `${new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    ...(dateOnly ? {} : { timeStyle: 'short' as const })
  }).format(timestamp)}${dateOnly ? '' : ' IST'}`
}

function resetLabel(timestamp: number | undefined, now: number): string {
  if (!timestamp) return 'Reset time not reported'
  const absolute = istTime(timestamp)
  if (timestamp <= now) return `Was due ${absolute} · refresh`
  const days = Math.floor((timestamp - now) / 86_400_000)
  return `Resets ${days >= 2 ? `in ${days}d` : relativeTime(timestamp, now)} · ${absolute}`
}

function expectedWindows(provider: AIAccount['providerId']): { id: string; label: string }[] {
  if (provider === 'gemini') return [{ id: 'daily', label: 'Daily limit' }]
  if (provider === 'custom') return []
  return [
    { id: 'five-hour', label: '5-hour limit' },
    { id: 'weekly', label: 'Weekly limit' }
  ]
}

function buildManualUsage(draft: Draft): AccountUsage {
  const windows: NonNullable<AccountUsage['windows']> = []
  for (const [id, label, percentKey, resetKey] of [
    ['five-hour', '5-hour limit', 'fiveHourPercent', 'fiveHourReset'],
    ['weekly', 'Weekly limit', 'weeklyPercent', 'weeklyReset'],
    ['daily', 'Daily limit', 'dailyPercent', 'dailyReset']
  ] as const) {
    const percent = draft[percentKey].trim()
    const reset = draft[resetKey]
    if (!percent && !reset) continue
    if (!percent) throw new Error(`${label}: enter a used percentage before the reset time.`)
    const usedPercent = Number(percent)
    if (!Number.isFinite(usedPercent) || usedPercent < 0 || usedPercent > 100) {
      throw new Error(`${label}: usage must be from 0% to 100%.`)
    }
    const resetsAt = reset ? new Date(reset).getTime() : undefined
    if (reset && !Number.isFinite(resetsAt)) throw new Error(`${label}: enter a valid reset date.`)
    windows.push({ id, label, usedPercent, resetsAt })
  }
  const resetCount = draft.resetsAvailable.trim()
  const available = resetCount ? Number(resetCount) : undefined
  if (
    available !== undefined &&
    (!Number.isInteger(available) || available < 0 || available > 100)
  ) {
    throw new Error('Available resets must be a whole number from 0 to 100.')
  }
  const expiresAt = draft.resetsExpires ? new Date(draft.resetsExpires).getTime() : undefined
  if (draft.resetsExpires && !Number.isFinite(expiresAt)) {
    throw new Error('Enter a valid reset expiry date.')
  }
  if (expiresAt && available === undefined) {
    throw new Error('Enter the available reset count before its expiry date.')
  }
  if (windows.length === 0 && available === undefined) {
    throw new Error('Enter at least one usage percentage or available reset count.')
  }
  return { source: 'manual', windows, resets: { available, expiresAt } }
}

export default function UsagePanel({ onOpenAccount }: UsagePanelProps): JSX.Element {
  const { state, dispatch } = useApp()
  const [automatic, setAutomatic] = useState<Record<string, AccountUsage | null>>({})
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [lastChecked, setLastChecked] = useState<number | null>(null)
  const [filter, setFilter] = useState<'all' | 'reported' | 'missing'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success')
  const [now, setNow] = useState(0)
  const refreshSequence = useRef(0)
  const isMounted = useRef(true)

  const refresh = useCallback(async (): Promise<void> => {
    const sequence = ++refreshSequence.current
    setIsRefreshing(true)
    const results = await Promise.all(
      state.aiAccounts.map(async (account) => {
        try {
          return {
            id: account.id,
            usage: await window.api.getAccountUsage(account.id),
            failed: false
          }
        } catch {
          return { id: account.id, usage: null, failed: true }
        }
      })
    )
    // A newer refresh or an unmounted panel must not be overwritten by an older IPC response.
    if (isMounted.current && sequence === refreshSequence.current) {
      setAutomatic(Object.fromEntries(results.map(({ id, usage }) => [id, usage])))
      const checkedAt = Date.now()
      setNow(checkedAt)
      setLastChecked(checkedAt)
      setHasLoaded(true)
      setIsRefreshing(false)
      if (results.some(({ failed }) => failed)) {
        setFeedbackTone('error')
        setFeedback('Some local readings could not be checked. Saved readings remain visible.')
      } else {
        setFeedback(null)
      }
    }
  }, [state.aiAccounts])

  useEffect(() => {
    isMounted.current = true
    let active = true
    queueMicrotask(() => {
      if (active) void refresh()
    })
    const timer = setInterval(() => void refresh(), 120_000)
    return () => {
      active = false
      isMounted.current = false
      refreshSequence.current += 1
      clearInterval(timer)
    }
  }, [refresh])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const save = async (account: AIAccount, clear = false): Promise<void> => {
    setBusyId(account.id)
    setFeedback(null)
    try {
      const usage = clear ? null : buildManualUsage(draft)
      if (!(await window.api.saveAccountUsage(account.id, usage)))
        throw new Error('Could not save usage.')
      const accounts = await window.api.getAIAccounts()
      dispatch({ type: 'SET_AI_ACCOUNTS', accounts })
      setEditingId(null)
      setFeedbackTone('success')
      setFeedback(
        clear ? `Cleared ${account.name} manual reading.` : `Saved ${account.name} manual reading.`
      )
    } catch (error) {
      setFeedbackTone('error')
      setFeedback(error instanceof Error ? error.message : 'Could not save usage.')
    } finally {
      setBusyId(null)
    }
  }

  const readingFor = (account: AIAccount): AccountUsage | undefined =>
    automatic[account.id] || (account.usage?.source === 'manual' ? account.usage : undefined)
  const reportedCount = state.aiAccounts.filter((account) => Boolean(readingFor(account))).length
  const attentionCount = state.aiAccounts.filter((account) =>
    readingFor(account)?.windows?.some((window) => (window.usedPercent ?? 0) >= 70)
  ).length
  const nextResetAt = state.aiAccounts
    .flatMap((account) => readingFor(account)?.windows?.map((window) => window.resetsAt) || [])
    .filter((time): time is number => typeof time === 'number' && time > now)
    .sort((a, b) => a - b)[0]
  const visibleAccounts = state.aiAccounts.filter((account) => {
    if (filter === 'all') return true
    return filter === 'reported' ? Boolean(readingFor(account)) : !readingFor(account)
  })

  return (
    <section
      className="usage-section"
      aria-labelledby="usage-section-title"
      aria-busy={isRefreshing}
    >
      <div className="usage-section-heading">
        <div>
          <span className="section-overline">Account capacity · live overview</span>
          <h1 id="usage-section-title">Usage dashboard</h1>
          <p>
            See reported limits, reset times, and available resets for each account. Codex reads
            local CLI data; Claude reads its signed-in usage page. Enter other provider readings
            manually when automatic data is unavailable.
          </p>
        </div>
        <div className="usage-heading-actions">
          <span className="usage-last-checked">
            {lastChecked ? `Checked ${relativeTime(lastChecked, now)}` : 'Checking local readings'}
          </span>
          <button
            type="button"
            className="usage-refresh"
            onClick={() => void refresh()}
            disabled={isRefreshing}
          >
            <RefreshCw size={16} className={isRefreshing ? 'is-spinning' : ''} />
            {isRefreshing ? 'Checking…' : 'Refresh readings'}
          </button>
        </div>
      </div>

      <div className="usage-overview" aria-label="Usage overview">
        <div className="usage-overview-item">
          <span>Accounts</span>
          <strong>{state.aiAccounts.length}</strong>
          <small>Separate provider profiles</small>
        </div>
        <div className="usage-overview-item is-reported">
          <span>With readings</span>
          <strong>
            {reportedCount}
            <em> / {state.aiAccounts.length}</em>
          </strong>
          <small>Connected or manually saved</small>
        </div>
        <div className={`usage-overview-item${attentionCount ? ' is-attention' : ''}`}>
          <span>At 70% or higher</span>
          <strong>{attentionCount}</strong>
          <small>
            {attentionCount ? 'Review upcoming resets' : 'No reported limits near full'}
          </small>
        </div>
        <div className="usage-overview-item is-next-reset">
          <span>Next reported reset</span>
          <strong>{nextResetAt ? relativeTime(nextResetAt, now) : '—'}</strong>
          <small>{nextResetAt ? istTime(nextResetAt) : 'Waiting for a reset time'}</small>
        </div>
      </div>

      <div className="usage-list-heading">
        <div>
          <Activity size={17} />
          <h2>Account limits</h2>
        </div>
        <div className="usage-filters" role="group" aria-label="Filter accounts by reading">
          {(
            [
              ['all', 'All', state.aiAccounts.length],
              ['reported', 'With reading', reportedCount],
              ['missing', 'Needs update', state.aiAccounts.length - reportedCount]
            ] as const
          ).map(([key, label, count]) => (
            <button
              type="button"
              key={key}
              className={filter === key ? 'is-active' : ''}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label} <span>{count}</span>
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <p
          className={`usage-feedback is-${feedbackTone}`}
          role={feedbackTone === 'error' ? 'alert' : 'status'}
        >
          {feedback}
        </p>
      )}
      {state.aiAccounts.length === 0 ? (
        <div className="dashboard-empty">Add an account to track its usage.</div>
      ) : visibleAccounts.length === 0 ? (
        <div className="usage-filter-empty">
          <CircleAlert size={22} />
          <strong>
            {filter === 'missing' ? 'Every account has a reading' : 'No readings yet'}
          </strong>
          <p>
            {filter === 'missing'
              ? 'There are no accounts waiting for an update.'
              : 'Use a provider usage page or add a manual reading.'}
          </p>
          <button type="button" onClick={() => setFilter('all')}>
            Show all accounts
          </button>
        </div>
      ) : (
        <div className="usage-grid">
          {visibleAccounts.map((account) => {
            const live = automatic[account.id]
            const manual = account.usage?.source === 'manual' ? account.usage : undefined
            const reading = live || manual
            const expected = expectedWindows(account.providerId)
            const windows: NonNullable<AccountUsage['windows']> = reading?.windows?.length
              ? [
                  ...reading.windows,
                  ...expected.filter(
                    (item) => !reading.windows?.some((window) => window.id.endsWith(item.id))
                  )
                ]
              : expected
            const resets = reading?.resets
            const isEditing = editingId === account.id
            const usageUrl = usageUrls[account.providerId]
            const stale = reading?.observedAt && now - reading.observedAt > 30 * 60_000
            return (
              <article
                className="usage-card"
                data-provider={account.providerId}
                key={account.id}
                aria-label={`${account.name} usage`}
              >
                <div className="usage-card-heading">
                  <div>
                    <strong>{account.name}</strong>
                    <span
                      className={`usage-source${stale ? ' is-stale' : ''}${!reading ? ' is-unavailable' : ''}`}
                    >
                      {reading?.source === 'local-codex'
                        ? 'Local Codex reading'
                        : reading?.source === 'claude-web'
                          ? 'Claude web reading'
                          : reading?.source === 'manual'
                            ? 'Manual reading'
                            : isRefreshing && !hasLoaded
                              ? 'Checking connected account…'
                              : 'No reading yet'}
                      {reading?.observedAt ? ` · ${relativeTime(reading.observedAt, now)}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="usage-open"
                    onClick={() => {
                      if (account.providerId === 'gemini') {
                        void window.api
                          .openExternalURL(account.url)
                          .then((opened) => {
                            setFeedbackTone(opened ? 'success' : 'error')
                            setFeedback(
                              opened
                                ? `${account.name} opened in your browser. Nexus has no automatic Gemini usage reading; enter one manually if available.`
                                : `Could not open ${account.name}. Check its URL and your default browser.`
                            )
                          })
                          .catch(() => {
                            setFeedbackTone('error')
                            setFeedback(`Could not open ${account.name} in your browser.`)
                          })
                      } else {
                        onOpenAccount?.({ ...account, url: usageUrl || account.url })
                        dispatch({ type: 'SET_MODE', mode: 'code' })
                      }
                    }}
                    aria-label={`${usageUrl ? 'Open usage for' : account.providerId === 'gemini' ? 'Open browser for' : 'Open provider for'} ${account.name}`}
                  >
                    <ArrowUpRight size={15} />{' '}
                    {usageUrl
                      ? 'Usage page'
                      : account.providerId === 'gemini'
                        ? 'Browser'
                        : 'Provider'}
                  </button>
                </div>
                {windows.length > 0 ? (
                  <div className="usage-window-list">
                    {windows.map((window) => (
                      <div className="usage-window" key={window.id}>
                        <div className="usage-window-line">
                          <span>
                            {window.bucket ? `${window.bucket} · ` : ''}
                            {window.label}
                          </span>
                          <strong>
                            {window.usedPercent === undefined
                              ? '—'
                              : `${Math.round(window.usedPercent)}% used`}
                          </strong>
                        </div>
                        <div
                          className={`usage-meter${window.usedPercent === undefined ? (isRefreshing && !hasLoaded ? ' is-loading' : ' is-unknown') : window.usedPercent >= 90 ? ' is-critical' : window.usedPercent >= 70 ? ' is-warning' : ''}`}
                          role="progressbar"
                          aria-label={`${account.name} ${window.label} used`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={window.usedPercent}
                          aria-valuetext={
                            window.usedPercent === undefined
                              ? 'Not reported'
                              : `${Math.round(window.usedPercent)} percent used`
                          }
                        >
                          {window.usedPercent !== undefined && (
                            <span style={{ width: `${window.usedPercent}%` }} />
                          )}
                        </div>
                        <small>
                          <Clock3 size={12} /> {resetLabel(window.resetsAt, now)}
                          {window.observedAt && now - window.observedAt > 30 * 60_000
                            ? ` · seen ${relativeTime(window.observedAt, now)}`
                            : ''}
                        </small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="usage-no-window">
                    This provider does not publish a shared 5-hour or weekly limit here.
                  </p>
                )}
                <div className="usage-reset-summary">
                  <span>Available resets</span>
                  <strong>
                    {resets?.available === undefined ? 'Not reported' : resets.available}
                  </strong>
                  {(resets?.fullAvailable !== undefined ||
                    resets?.fiveHourAvailable !== undefined) && (
                    <div className="usage-reset-breakdown">
                      {resets.fullAvailable !== undefined && (
                        <span>Full reset: {resets.fullAvailable}</span>
                      )}
                      {resets.fiveHourAvailable !== undefined && (
                        <span>5-hour reset: {resets.fiveHourAvailable}</span>
                      )}
                    </div>
                  )}
                  <small>
                    {resets?.expiresAt
                      ? `Full reset expires ${istTime(resets.expiresAt, reading?.source === 'claude-web')}`
                      : 'Expiry not reported'}
                  </small>
                </div>
                <div className="usage-card-actions">
                  <button
                    type="button"
                    disabled={busyId === account.id}
                    onClick={() => {
                      setEditingId(isEditing ? null : account.id)
                      setDraft(draftFrom(manual))
                      setFeedback(null)
                    }}
                  >
                    {isEditing ? 'Cancel update' : 'Update manually'}
                  </button>
                  {manual && !isEditing && (
                    <button
                      type="button"
                      onClick={() => void save(account, true)}
                      disabled={busyId === account.id}
                    >
                      Clear manual
                    </button>
                  )}
                </div>
                {isEditing && (
                  <form
                    className="usage-editor"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void save(account)
                    }}
                  >
                    <p>
                      Copy the values shown by {account.name}. Manual entries stay labeled with
                      their update time.
                    </p>
                    {(account.providerId === 'gemini'
                      ? [['dailyPercent', 'dailyReset', 'Daily limit']]
                      : [
                          ['fiveHourPercent', 'fiveHourReset', '5-hour limit'],
                          ['weeklyPercent', 'weeklyReset', 'Weekly limit']
                        ]
                    ).map(([percentKey, resetKey, label]) => (
                      <div className="usage-editor-row" key={label}>
                        <label>
                          {label} used %
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={draft[percentKey as keyof Draft]}
                            onChange={(event) =>
                              setDraft((old) => ({ ...old, [percentKey]: event.target.value }))
                            }
                            placeholder="Unknown"
                          />
                        </label>
                        <label>
                          Resets at
                          <input
                            type="datetime-local"
                            value={draft[resetKey as keyof Draft]}
                            onChange={(event) =>
                              setDraft((old) => ({ ...old, [resetKey]: event.target.value }))
                            }
                          />
                        </label>
                      </div>
                    ))}
                    <div className="usage-editor-row">
                      <label>
                        Resets available
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={draft.resetsAvailable}
                          onChange={(event) =>
                            setDraft((old) => ({ ...old, resetsAvailable: event.target.value }))
                          }
                          placeholder="Unknown"
                        />
                      </label>
                      <label>
                        Reset expires
                        <input
                          type="datetime-local"
                          value={draft.resetsExpires}
                          onChange={(event) =>
                            setDraft((old) => ({ ...old, resetsExpires: event.target.value }))
                          }
                        />
                      </label>
                    </div>
                    <div className="usage-editor-actions">
                      <button type="button" onClick={() => setEditingId(null)}>
                        <X size={13} /> Cancel
                      </button>
                      <button type="submit" disabled={busyId === account.id}>
                        <Save size={13} /> {busyId === account.id ? 'Saving…' : 'Save reading'}
                      </button>
                    </div>
                  </form>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
