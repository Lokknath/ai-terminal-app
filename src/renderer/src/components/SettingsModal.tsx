import { useState, useEffect, useCallback, useRef } from 'react'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useApp } from '../store/AppContext'
import {
  X,
  Plus,
  Trash2,
  ExternalLink,
  Check,
  Edit2,
  Terminal,
  Globe,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Star,
  Key,
  Eye,
  EyeOff
} from 'lucide-react'
import { AIAccount, DetectedCLI, CLIAccountAuth, getProviderCliLoginCommand } from '../types'
import { SubscriptionBadge } from './SubscriptionBadge'

interface SettingsModalProps {
  onOpenAccountLogin?: (account: AIAccount) => void
  onOpenTerminalWithAccount?: (account: AIAccount, command?: string) => void
}

interface AccountLiveStatus {
  cliAuth?: CLIAccountAuth
  webAuth?: { isAuthenticated: boolean; cookieCount: number; userEmail?: string }
  isChecking?: boolean
}

export default function SettingsModal({
  onOpenAccountLogin,
  onOpenTerminalWithAccount
}: SettingsModalProps): JSX.Element {
  const { dispatch } = useApp()
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus(dialogRef, () => dispatch({ type: 'SET_SHOW_SETTINGS', show: false }))
  const [activeTab, setActiveTab] = useState<'accounts' | 'cli'>('accounts')
  const [accounts, setAccounts] = useState<AIAccount[]>([])
  const [detectedCLIs, setDetectedCLIs] = useState<DetectedCLI[]>([])
  const [accountStatuses, setAccountStatuses] = useState<Record<string, AccountLiveStatus>>({})
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null)
  const [providerFilter, setProviderFilter] = useState<
    'all' | 'claude' | 'chatgpt' | 'gemini' | 'custom'
  >('all')

  // New account form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newProvider, setNewProvider] = useState<'claude' | 'chatgpt' | 'gemini' | 'custom'>(
    'claude'
  )
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('https://claude.ai')
  const [newCliConfigDir, setNewCliConfigDir] = useState('')
  const [newGoogleEmail, setNewGoogleEmail] = useState('')
  const [newEnvVars, setNewEnvVars] = useState<{ key: string; value: string; masked: boolean }[]>(
    []
  )

  // Inline editing state for existing accounts
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editCliConfigDir, setEditCliConfigDir] = useState('')
  const [editGoogleEmail, setEditGoogleEmail] = useState('')
  const [editEnvVars, setEditEnvVars] = useState<{ key: string; value: string; masked: boolean }[]>(
    []
  )

  const defaultUrls: Record<string, string> = {
    claude: 'https://claude.ai',
    chatgpt: 'https://chatgpt.com',
    gemini: 'https://gemini.google.com',
    custom: 'https://'
  }

  const computeDefaultConfigDir = (
    provider: 'claude' | 'chatgpt' | 'gemini' | 'custom',
    name: string
  ): string => {
    const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'account'
    if (provider === 'claude') return `~/.claude-${slug}`
    if (provider === 'chatgpt') return `~/.codex-${slug}`
    if (provider === 'gemini') return `~/.gemini-${slug}`
    return ''
  }

  const refreshStatuses = useCallback(async (accs: AIAccount[]): Promise<void> => {
    setIsRefreshing(true)
    await Promise.all(
      accs.map(async (acc) => {
        try {
          const [cliAuth, webAuth] = await Promise.all([
            window.api.getCLIAccountAuth(acc).catch(() => ({ loggedIn: false })),
            window.api
              .checkPartitionWebAuth(acc.partition, acc.providerId)
              .catch(() => ({ isAuthenticated: false, cookieCount: 0 }))
          ])
          setAccountStatuses((prev) => ({
            ...prev,
            [acc.id]: { cliAuth, webAuth, isChecking: false }
          }))
        } catch {
          /* skip */
        }
      })
    )
    setIsRefreshing(false)
  }, [])

  const loadData = useCallback(async (): Promise<void> => {
    try {
      const [accs, clis] = await Promise.all([
        window.api.getAIAccounts(),
        window.api.detectCLIAgents()
      ])
      setAccounts(accs)
      dispatch({ type: 'SET_AI_ACCOUNTS', accounts: accs })
      setDetectedCLIs(clis)
      void refreshStatuses(accs)
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Could not load settings',
        error: true
      })
    }
  }, [dispatch, refreshStatuses])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [loadData])

  const handleProviderChange = (prov: 'claude' | 'chatgpt' | 'gemini' | 'custom'): void => {
    setNewProvider(prov)
    setNewUrl(defaultUrls[prov] || 'https://')
    const defaultName =
      prov === 'claude'
        ? 'Claude (Work)'
        : prov === 'chatgpt'
          ? 'ChatGPT (Work)'
          : prov === 'gemini'
            ? 'Gemini (Work)'
            : 'Custom Portal'
    setNewName(defaultName)
    setNewCliConfigDir(computeDefaultConfigDir(prov, defaultName))
  }

  const applyPreset = (preset: 'personal' | 'work' | 'secondary'): void => {
    const provName =
      newProvider === 'claude'
        ? 'Claude'
        : newProvider === 'chatgpt'
          ? 'ChatGPT'
          : newProvider === 'gemini'
            ? 'Gemini'
            : 'Account'
    const name = `${provName} (${preset.charAt(0).toUpperCase() + preset.slice(1)})`
    setNewName(name)
    setNewCliConfigDir(computeDefaultConfigDir(newProvider, name))
  }

  const saveNewAccount = async (): Promise<void> => {
    const name = newName.trim()
    let url: URL
    try {
      url = new URL(newUrl.trim())
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error()
    } catch {
      setFeedback({
        message: 'Enter a valid website URL starting with https:// or http://.',
        error: true
      })
      return
    }
    if (!name) {
      setFeedback({ message: 'Enter a name for this account.', error: true })
      return
    }
    setIsSaving(true)
    setFeedback(null)

    const envVars: Record<string, string> = {}
    for (const item of newEnvVars) {
      const trimmedKey = item.key.trim()
      if (trimmedKey && /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmedKey)) {
        envVars[trimmedKey] = item.value
      }
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const newAccount: AIAccount = {
      id: `acc-${slug}-${Date.now()}`,
      providerId: newProvider,
      name,
      url: url.toString(),
      partition: `persist:account-${slug}-${Date.now()}`,
      cliConfigDir: newCliConfigDir.trim() || computeDefaultConfigDir(newProvider, newName),
      googleEmail: newGoogleEmail.trim() || undefined,
      envVars: Object.keys(envVars).length > 0 ? envVars : undefined,
      createdAt: Date.now()
    }

    try {
      if (!(await window.api.saveAIAccount(newAccount))) throw new Error('Account was not saved')
      setShowAddForm(false)
      setNewName('')
      setNewCliConfigDir('')
      setNewGoogleEmail('')
      setNewEnvVars([])
      await loadData()
      setFeedback({ message: `${name} was added.`, error: false })
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Could not save account',
        error: true
      })
    } finally {
      setIsSaving(false)
    }
  }

  const updateAccountCredentials = async (acc: AIAccount): Promise<void> => {
    let url: URL
    try {
      url = new URL(editUrl.trim())
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error()
    } catch {
      setFeedback({
        message: 'Enter a valid website URL starting with https:// or http://.',
        error: true
      })
      return
    }
    const envVars: Record<string, string> = {}
    for (const item of editEnvVars) {
      const trimmedKey = item.key.trim()
      if (trimmedKey && /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmedKey)) {
        envVars[trimmedKey] = item.value
      }
    }
    const updated: AIAccount = {
      ...acc,
      name: editName.trim() || acc.name,
      url: url.toString(),
      cliConfigDir: editCliConfigDir.trim() || acc.cliConfigDir,
      googleEmail: editGoogleEmail.trim() || undefined,
      envVars: Object.keys(envVars).length > 0 ? envVars : undefined
    }
    setBusyAccountId(acc.id)
    try {
      if (!(await window.api.saveAIAccount(updated))) throw new Error('Account was not saved')
      setEditingAccountId(null)
      setEditName('')
      setEditUrl('')
      setEditCliConfigDir('')
      setEditGoogleEmail('')
      setEditEnvVars([])
      await loadData()
      setFeedback({ message: `${updated.name} was updated.`, error: false })
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Could not update account',
        error: true
      })
    } finally {
      setBusyAccountId(null)
    }
  }

  const deleteAccount = async (id: string): Promise<void> => {
    setBusyAccountId(id)
    try {
      if (!(await window.api.deleteAIAccount(id))) throw new Error('Account was not removed')
      await loadData()
      setPendingDeleteId(null)
      setFeedback({ message: 'Account removed.', error: false })
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Could not remove account',
        error: true
      })
    } finally {
      setBusyAccountId(null)
    }
  }

  const setAsDefaultAccount = async (id: string): Promise<void> => {
    setBusyAccountId(id)
    try {
      const account = accounts.find((item) => item.id === id)
      if (!account || !(await window.api.saveAIAccount({ ...account, isDefault: true }))) {
        throw new Error('Default account was not saved')
      }
      await loadData()
      setFeedback({ message: 'Default account updated.', error: false })
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Could not change default',
        error: true
      })
    } finally {
      setBusyAccountId(null)
    }
  }

  const filteredAccounts = accounts.filter((acc) => {
    if (providerFilter === 'all') return true
    return acc.providerId === providerFilter
  })

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dispatch({ type: 'SET_SHOW_SETTINGS', show: false })
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="AI accounts and workspace settings"
        style={{
          width: '680px',
          maxHeight: '85vh',
          backgroundColor: '#141418',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 25px 70px rgba(0,0,0,0.8)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>⚙️</span>
            <div>
              <h4 style={{ color: '#fff', margin: 0, fontSize: '15px', fontWeight: 600 }}>
                Nexus · AI Accounts & Workspace Settings
              </h4>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#9ba8b8' }}>
                Provider sign-in · Separate web sessions and CLI profiles on your disk
              </p>
            </div>
          </div>
          <button
            onClick={() => dispatch({ type: 'SET_SHOW_SETTINGS', show: false })}
            aria-label="Close settings"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              display: 'flex'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {feedback && (
          <div
            className={feedback.error ? 'settings-feedback is-error' : 'settings-feedback'}
            role={feedback.error ? 'alert' : 'status'}
          >
            {feedback.message}
          </div>
        )}

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            backgroundColor: 'rgba(0,0,0,0.2)'
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              {
                id: 'accounts' as const,
                label: `🌐 AI Accounts & Sign-in (${accounts.length})`
              },
              { id: 'cli' as const, label: `🖥 CLI Tools Detected (${detectedCLIs.length})` }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: activeTab === tab.id ? 600 : 500,
                  backgroundColor:
                    activeTab === tab.id ? 'rgba(117, 157, 255, 0.15)' : 'transparent',
                  color: activeTab === tab.id ? '#8baeff' : '#888',
                  transition: 'all 0.1s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'accounts' && (
            <button
              onClick={() => refreshStatuses(accounts)}
              disabled={isRefreshing}
              title="Refresh live login status"
              style={{
                background: 'transparent',
                border: 'none',
                color: isRefreshing ? '#8baeff' : '#777',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px'
              }}
            >
              <RefreshCw size={12} className={isRefreshing ? 'spin' : ''} />
              <span>{isRefreshing ? 'Checking...' : 'Refresh Status'}</span>
            </button>
          )}
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* Tab 1: AI Accounts */}
          {activeTab === 'accounts' && (
            <div>
              {/* Info Banner */}
              <div
                style={{
                  backgroundColor: 'rgba(117, 157, 255, 0.05)',
                  border: '1px solid rgba(117, 157, 255, 0.18)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px'
                }}
              >
                <Sparkles size={18} color="#8baeff" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div style={{ fontSize: '12px', color: '#ccc', lineHeight: 1.5 }}>
                  <strong style={{ color: '#8baeff' }}>
                    Multiple Accounts of Same AI Provider:
                  </strong>{' '}
                  Keep separate Claude and ChatGPT web profiles and separate CLI profile
                  directories. Google sign-in opens in your system browser; Gemini terminal sign-in
                  uses its own CLI profile.
                </div>
              </div>

              {/* Sub-header with Filter and Add Button */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '14px'
                }}
              >
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[
                    { id: 'all' as const, label: 'All' },
                    { id: 'claude' as const, label: '🧠 Claude' },
                    { id: 'chatgpt' as const, label: '🤖 ChatGPT' },
                    { id: 'gemini' as const, label: '💎 Gemini' }
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => setProviderFilter(filter.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                        backgroundColor:
                          providerFilter === filter.id
                            ? 'rgba(255,255,255,0.1)'
                            : 'rgba(255,255,255,0.03)',
                        color: providerFilter === filter.id ? '#fff' : '#777'
                      }}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    backgroundColor: '#5579db',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Plus size={14} /> Add Another Account
                </button>
              </div>

              {/* Add Account Inline Form */}
              {showAddForm && (
                <div
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(117, 157, 255, 0.3)',
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#8baeff' }}>
                      Add New Account / Profile
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#9ba8b8', alignSelf: 'center' }}>
                        Quick Presets:
                      </span>
                      {(['personal', 'work', 'secondary'] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => applyPreset(p)}
                          style={{
                            padding: '2px 8px',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '4px',
                            color: '#ccc',
                            fontSize: '11px',
                            cursor: 'pointer',
                            textTransform: 'capitalize'
                          }}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          color: '#888',
                          marginBottom: '4px'
                        }}
                      >
                        AI Provider
                      </label>
                      <select
                        value={newProvider}
                        onChange={(e) =>
                          handleProviderChange(
                            e.target.value as 'claude' | 'chatgpt' | 'gemini' | 'custom'
                          )
                        }
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          backgroundColor: '#1c1c22',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: '6px',
                          color: '#fff',
                          fontSize: '13px',
                          outline: 'none'
                        }}
                      >
                        <option value="claude">🧠 Claude (Claude.ai / claude CLI)</option>
                        <option value="chatgpt">🤖 ChatGPT (chatgpt.com / codex CLI)</option>
                        <option value="gemini">💎 Google Gemini (gemini.google.com)</option>
                        <option value="custom">🌐 Custom Portal URL</option>
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          color: '#888',
                          marginBottom: '4px'
                        }}
                      >
                        Account Label / Name
                      </label>
                      <input
                        value={newName}
                        aria-label="Account name"
                        onChange={(e) => {
                          setNewName(e.target.value)
                          setNewCliConfigDir(computeDefaultConfigDir(newProvider, e.target.value))
                        }}
                        placeholder="e.g. Claude (Work) or Personal ChatGPT"
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          backgroundColor: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: '6px',
                          color: '#fff',
                          fontSize: '13px',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="new-account-url" className="settings-field-label">
                      Website URL
                    </label>
                    <input
                      id="new-account-url"
                      type="url"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      placeholder="https://example.com"
                      aria-describedby="new-account-url-help"
                      className="settings-text-input"
                    />
                    <span id="new-account-url-help" className="settings-field-help">
                      Use the site where this account signs in.
                    </span>
                  </div>

                  {/* Isolated Profile Directory */}
                  <div
                    style={{
                      padding: '10px 12px',
                      backgroundColor: 'rgba(117, 157, 255, 0.04)',
                      border: '1px solid rgba(117, 157, 255, 0.15)',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <label style={{ fontSize: '12px', color: '#8baeff', fontWeight: 500 }}>
                        📁 Isolated Terminal Profile Directory:
                      </label>
                      <span style={{ fontSize: '11px', color: '#9ba8b8' }}>
                        Env var:{' '}
                        {newProvider === 'claude'
                          ? 'CLAUDE_CONFIG_DIR'
                          : newProvider === 'chatgpt'
                            ? 'CODEX_HOME'
                            : 'GEMINI_DIR / HOME'}
                      </span>
                    </div>
                    <input
                      value={newCliConfigDir}
                      onChange={(e) => setNewCliConfigDir(e.target.value)}
                      placeholder="~/.claude-work"
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        backgroundColor: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '4px',
                        color: '#81c784',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        boxSizing: 'border-box'
                      }}
                    />
                    <span style={{ fontSize: '11px', color: '#888' }}>
                      This profile uses its own directory for CLI sign-in and stays separate from
                      other accounts.
                    </span>
                  </div>

                  {newProvider === 'gemini' && (
                    <div>
                      <label className="settings-field-label">Account Google Email (Optional)</label>
                      <input
                        type="email"
                        value={newGoogleEmail}
                        onChange={(e) => setNewGoogleEmail(e.target.value)}
                        placeholder="e.g. user@gmail.com"
                        className="settings-text-input"
                      />
                      <span className="settings-field-help">
                        Used by Antigravity CLI (agy) and Google Cloud SDK to isolate this Gemini profile.
                      </span>
                    </div>
                  )}

                  {/* Custom Environment Variables & Secrets */}
                  <div
                    style={{
                      padding: '10px 12px',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <label
                        style={{
                          fontSize: '11px',
                          color: '#8baeff',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Key size={12} /> Custom Environment Variables & Secrets (Encrypted)
                      </label>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const defaultKey =
                              newProvider === 'claude'
                                ? 'ANTHROPIC_API_KEY'
                                : newProvider === 'chatgpt'
                                  ? 'OPENAI_API_KEY'
                                  : newProvider === 'gemini'
                                    ? 'GEMINI_API_KEY'
                                    : 'API_KEY'
                            setNewEnvVars((prev) => [
                              ...prev,
                              { key: defaultKey, value: '', masked: true }
                            ])
                          }}
                          style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'rgba(117,157,255,0.12)',
                            border: '1px solid rgba(117,157,255,0.3)',
                            color: '#8baeff',
                            cursor: 'pointer'
                          }}
                        >
                          + Add API Key
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setNewEnvVars((prev) => [
                              ...prev,
                              { key: '', value: '', masked: false }
                            ])
                          }
                          style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: '#ccc',
                            cursor: 'pointer'
                          }}
                        >
                          + Add Variable
                        </button>
                      </div>
                    </div>

                    {newEnvVars.length === 0 ? (
                      <span style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                        Optional: Set API keys or custom tokens to inject into this account&apos;s
                        terminals.
                      </span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {newEnvVars.map((item, idx) => (
                          <div
                            key={idx}
                            style={{ display: 'flex', gap: '6px', alignItems: 'center' }}
                          >
                            <input
                              value={item.key}
                              onChange={(e) => {
                                const val = e.target.value
                                setNewEnvVars((prev) =>
                                  prev.map((it, i) => (i === idx ? { ...it, key: val } : it))
                                )
                              }}
                              placeholder="VARIABLE_NAME"
                              style={{
                                width: '40%',
                                padding: '4px 8px',
                                backgroundColor: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: '4px',
                                color: '#8baeff',
                                fontSize: '11px',
                                fontFamily: 'monospace'
                              }}
                            />
                            <input
                              type={item.masked ? 'password' : 'text'}
                              value={item.value}
                              onChange={(e) => {
                                const val = e.target.value
                                setNewEnvVars((prev) =>
                                  prev.map((it, i) => (i === idx ? { ...it, value: val } : it))
                                )
                              }}
                              placeholder="Secret value"
                              style={{
                                flex: 1,
                                padding: '4px 8px',
                                backgroundColor: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: '4px',
                                color: '#fff',
                                fontSize: '11px',
                                fontFamily: 'monospace'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setNewEnvVars((prev) =>
                                  prev.map((it, i) =>
                                    i === idx ? { ...it, masked: !it.masked } : it
                                  )
                                )
                              }}
                              title={item.masked ? 'Show value' : 'Hide value'}
                              style={{
                                padding: '4px 6px',
                                background: 'transparent',
                                border: 'none',
                                color: '#888',
                                cursor: 'pointer'
                              }}
                            >
                              {item.masked ? <Eye size={13} /> : <EyeOff size={13} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setNewEnvVars((prev) => prev.filter((_, i) => i !== idx))
                              }}
                              title="Remove variable"
                              style={{
                                padding: '4px 6px',
                                background: 'transparent',
                                border: 'none',
                                color: '#e57373',
                                cursor: 'pointer'
                              }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      onClick={() => setShowAddForm(false)}
                      style={{
                        padding: '6px 14px',
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#aaa',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveNewAccount}
                      disabled={isSaving}
                      style={{
                        padding: '6px 16px',
                        background: '#5579db',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: newName.trim() ? 'pointer' : 'default',
                        fontSize: '12px',
                        fontWeight: 600
                      }}
                    >
                      {isSaving ? 'Saving…' : 'Save Account'}
                    </button>
                  </div>
                </div>
              )}

              {/* Accounts List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredAccounts.map((acc) => {
                  const icon =
                    acc.providerId === 'claude'
                      ? '🧠'
                      : acc.providerId === 'chatgpt'
                        ? '🤖'
                        : acc.providerId === 'gemini'
                          ? '💎'
                          : '🌐'
                  const isEditing = editingAccountId === acc.id
                  const status = accountStatuses[acc.id]
                  const isCLILoggedIn = status?.cliAuth?.loggedIn
                  const isWebLoggedIn = status?.webAuth?.isAuthenticated

                  return (
                    <div
                      key={acc.id}
                      style={{
                        padding: '14px 16px',
                        backgroundColor: 'rgba(255,255,255,0.02)',
                        border: isEditing
                          ? '1px solid rgba(117, 157, 255, 0.4)'
                          : '1px solid rgba(255,255,255,0.07)',
                        borderRadius: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        transition: 'all 0.15s'
                      }}
                    >
                      {/* Top Row: Provider Icon, Name, Badges, and Primary Actions */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '22px' }}>{icon}</span>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>
                                {acc.name}
                              </span>
                              <SubscriptionBadge
                                type={status?.cliAuth?.subscriptionType || acc.usage?.tier}
                              />
                              <span
                                style={{
                                  fontSize: '11px',
                                  color: '#8baeff',
                                  backgroundColor: 'rgba(117, 157, 255, 0.12)',
                                  border: '1px solid rgba(117, 157, 255, 0.25)',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  fontWeight: 500,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                              >
                                <Globe size={10} />{' '}
                                {acc.providerId === 'gemini' ? 'Browser + CLI' : 'Web profile'}
                              </span>

                              {acc.envVars && Object.keys(acc.envVars).length > 0 && (
                                <span
                                  style={{
                                    fontSize: '11px',
                                    color: '#81c784',
                                    backgroundColor: 'rgba(76, 175, 80, 0.12)',
                                    border: '1px solid rgba(76, 175, 80, 0.25)',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    fontWeight: 500,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                  title={`Custom secrets: ${Object.keys(acc.envVars).join(', ')}`}
                                >
                                  <Key size={10} /> {Object.keys(acc.envVars).length} Secret
                                  {Object.keys(acc.envVars).length > 1 ? 's' : ''}
                                </span>
                              )}

                              {acc.isDefault ? (
                                <span
                                  style={{
                                    fontSize: '11px',
                                    color: '#ffd54f',
                                    backgroundColor: 'rgba(255, 213, 79, 0.15)',
                                    border: '1px solid rgba(255, 213, 79, 0.35)',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                >
                                  <Star size={10} fill="#ffd54f" /> Default
                                </span>
                              ) : (
                                <button
                                  onClick={() => setAsDefaultAccount(acc.id)}
                                  disabled={busyAccountId !== null}
                                  title="Set as default account for new sessions"
                                  style={{
                                    fontSize: '11px',
                                    color: '#888',
                                    backgroundColor: 'transparent',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                  onMouseOver={(e) => {
                                    e.currentTarget.style.color = '#ffd54f'
                                    e.currentTarget.style.borderColor = 'rgba(255, 213, 79, 0.3)'
                                  }}
                                  onMouseOut={(e) => {
                                    e.currentTarget.style.color = '#888'
                                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                                  }}
                                >
                                  Make Default
                                </button>
                              )}
                            </div>

                            <div
                              style={{
                                fontSize: '12px',
                                color: '#a3afbd',
                                fontFamily: 'monospace',
                                marginTop: '3px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}
                            >
                              <span>{acc.url}</span>
                              <span>•</span>
                              <span style={{ color: '#555' }}>{acc.partition}</span>
                            </div>
                          </div>
                        </div>

                        {/* Top Action Buttons */}
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            onClick={() => {
                              if (isEditing) {
                                setEditingAccountId(null)
                                setEditGoogleEmail('')
                                setEditEnvVars([])
                              } else {
                                setEditingAccountId(acc.id)
                                setEditName(acc.name)
                                setEditUrl(acc.url)
                                setEditCliConfigDir(acc.cliConfigDir || '')
                                setEditGoogleEmail(acc.googleEmail || '')
                                setEditEnvVars(
                                  Object.entries(acc.envVars || {}).map(([key, value]) => ({
                                    key,
                                    value,
                                    masked: true
                                  }))
                                )
                              }
                            }}
                            title="Edit Account Profile"
                            style={{
                              padding: '5px 8px',
                              background: isEditing
                                ? 'rgba(117, 157, 255, 0.2)'
                                : 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: isEditing ? '#8baeff' : '#aaa',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              fontSize: '12px'
                            }}
                          >
                            <Edit2 size={12} />
                          </button>

                          {onOpenTerminalWithAccount && (
                            <button
                              onClick={() => {
                                onOpenTerminalWithAccount(acc)
                                dispatch({ type: 'SET_SHOW_SETTINGS', show: false })
                              }}
                              title="Open Terminal with this account's credentials"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '5px 10px',
                                backgroundColor: 'rgba(76, 175, 80, 0.12)',
                                border: '1px solid rgba(76, 175, 80, 0.3)',
                                color: '#4caf50',
                                borderRadius: '6px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                fontWeight: 500
                              }}
                            >
                              <Terminal size={12} /> Terminal
                            </button>
                          )}

                          <button
                            onClick={() => {
                              if (onOpenAccountLogin) {
                                onOpenAccountLogin(acc)
                                dispatch({ type: 'SET_SHOW_SETTINGS', show: false })
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 10px',
                              backgroundColor: 'rgba(117, 157, 255, 0.1)',
                              border: '1px solid rgba(117, 157, 255, 0.25)',
                              color: '#8baeff',
                              borderRadius: '6px',
                              fontSize: '12px',
                              cursor: 'pointer',
                              fontWeight: 500
                            }}
                          >
                            <ExternalLink size={12} /> Web Chat
                          </button>

                          <button
                            onClick={() => setPendingDeleteId(acc.id)}
                            disabled={busyAccountId !== null}
                            title="Delete Account"
                            aria-label={`Remove ${acc.name}`}
                            style={{
                              padding: '5px 8px',
                              background: 'rgba(244, 67, 54, 0.1)',
                              border: '1px solid rgba(244, 67, 54, 0.2)',
                              color: '#f44336',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {pendingDeleteId === acc.id && (
                        <div
                          className="delete-confirmation"
                          role="group"
                          aria-label={`Confirm removal of ${acc.name}`}
                        >
                          <span>
                            Remove {acc.name} from Nexus? Its saved browser session may still remain
                            on this device.
                          </span>
                          <button onClick={() => setPendingDeleteId(null)}>Cancel</button>
                          <button
                            onClick={() => deleteAccount(acc.id)}
                            disabled={busyAccountId === acc.id}
                          >
                            {busyAccountId === acc.id ? 'Removing…' : 'Remove account'}
                          </button>
                        </div>
                      )}

                      {/* Status Row: Web Chat & Terminal Status Indicators */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '8px',
                          backgroundColor: 'rgba(0,0,0,0.25)',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255,255,255,0.04)'
                        }}
                      >
                        {/* Web Chat Auth Status */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              color: '#888',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.4px'
                            }}
                          >
                            Web Chat Session
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {acc.providerId === 'custom' ? (
                              <span style={{ fontSize: '12px', color: '#a3afbd' }}>
                                Custom web profile
                              </span>
                            ) : isWebLoggedIn ? (
                              <span
                                style={{
                                  fontSize: '12px',
                                  color: '#81c784',
                                  fontWeight: 500,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <Check size={12} /> Signed in (active session)
                              </span>
                            ) : (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  width: '100%'
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: '12px',
                                    color: '#ffb74d',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                >
                                  <AlertCircle size={12} /> Not signed in
                                </span>
                                {acc.providerId === 'gemini' && (
                                  <button
                                    onClick={async () => {
                                      const res = await window.api.openGoogleLoginWindow(
                                        acc.partition,
                                        acc.providerId
                                      )
                                      if (res.success) {
                                        const updatedAccounts = await window.api.getAIAccounts()
                                        setAccounts(updatedAccounts)
                                        dispatch({
                                          type: 'SET_AI_ACCOUNTS',
                                          accounts: updatedAccounts
                                        })
                                        await refreshStatuses(updatedAccounts)
                                      }
                                    }}
                                    style={{
                                      padding: '2px 8px',
                                      backgroundColor: 'rgba(66, 133, 244, 0.15)',
                                      border: '1px solid rgba(66, 133, 244, 0.4)',
                                      color: '#8ab4f8',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      cursor: 'pointer'
                                    }}
                                    title="Sign in with Google inside Nexus"
                                  >
                                    Google Sign-In
                                  </button>
                                )}
                                {onOpenAccountLogin && (
                                  <button
                                    onClick={() => {
                                      onOpenAccountLogin(acc)
                                      dispatch({ type: 'SET_SHOW_SETTINGS', show: false })
                                    }}
                                    style={{
                                      padding: '2px 8px',
                                      backgroundColor: 'rgba(117, 157, 255, 0.12)',
                                      border: '1px solid rgba(117, 157, 255, 0.3)',
                                      color: '#8baeff',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontWeight: 500,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Web Chat ▶
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Terminal CLI Auth Status */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              color: '#888',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.4px'
                            }}
                          >
                            Terminal / CLI Session
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isCLILoggedIn ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span
                                  style={{
                                    fontSize: '12px',
                                    color: '#81c784',
                                    fontWeight: 500,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  <Check size={12} /> {status?.cliAuth?.email || 'Authenticated'}
                                </span>
                                {status?.cliAuth?.subscriptionType && (
                                  <span
                                    style={{
                                      fontSize: '10px',
                                      backgroundColor: 'rgba(76,175,80,0.2)',
                                      color: '#a5d6a7',
                                      padding: '1px 5px',
                                      borderRadius: '3px',
                                      fontWeight: 600
                                    }}
                                  >
                                    {status.cliAuth.subscriptionType}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  width: '100%'
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: '12px',
                                    color: '#ffb74d',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                >
                                  <AlertCircle size={12} /> Not logged in
                                </span>
                                {onOpenTerminalWithAccount && (
                                  <button
                                    onClick={() => {
                                      const loginCmd = getProviderCliLoginCommand(acc.providerId)
                                      onOpenTerminalWithAccount(acc, loginCmd)
                                      dispatch({ type: 'SET_SHOW_SETTINGS', show: false })
                                    }}
                                    style={{
                                      padding: '2px 8px',
                                      backgroundColor: 'rgba(76, 175, 80, 0.12)',
                                      border: '1px solid rgba(76, 175, 80, 0.3)',
                                      color: '#81c784',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontWeight: 500,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Login in Terminal ▶
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Codex & Claude Account Usage Reporting */}
                      {isCLILoggedIn && status?.cliAuth?.usage && (
                        <div
                          style={{
                            marginTop: '8px',
                            padding: '6px 12px',
                            backgroundColor: 'rgba(255, 255, 255, 0.02)',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.04)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '12px',
                            color: '#888'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Sparkles size={12} color="#8baeff" />
                            <span>Usage & Quota:</span>
                            <span style={{ color: '#eee', fontWeight: 500 }}>
                              {status.cliAuth.subscriptionType || 'Active'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                color: '#81c784',
                                fontFamily: 'monospace',
                                fontSize: '11px'
                              }}
                            >
                              {status.cliAuth.usage.resetsAt || 'Active'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Inline Edit Form for Account */}
                      {isEditing && (
                        <div
                          style={{
                            padding: '12px',
                            backgroundColor: 'rgba(117, 157, 255, 0.04)',
                            border: '1px solid rgba(117, 157, 255, 0.2)',
                            borderRadius: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px'
                          }}
                        >
                          <div
                            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}
                          >
                            <div>
                              <label
                                style={{
                                  fontSize: '11px',
                                  color: '#888',
                                  display: 'block',
                                  marginBottom: '3px'
                                }}
                              >
                                Account Name
                              </label>
                              <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  backgroundColor: 'rgba(255,255,255,0.06)',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  borderRadius: '4px',
                                  color: '#fff',
                                  fontSize: '12px',
                                  outline: 'none',
                                  boxSizing: 'border-box'
                                }}
                              />
                            </div>

                            <div>
                              <label
                                style={{
                                  fontSize: '11px',
                                  color: '#8baeff',
                                  display: 'block',
                                  marginBottom: '3px'
                                }}
                              >
                                Isolated Profile Directory (
                                {acc.providerId === 'claude'
                                  ? 'CLAUDE_CONFIG_DIR'
                                  : acc.providerId === 'chatgpt'
                                    ? 'CODEX_HOME'
                                    : 'GEMINI_DIR'}
                                )
                              </label>
                              <input
                                value={editCliConfigDir}
                                onChange={(e) => setEditCliConfigDir(e.target.value)}
                                placeholder="~/.claude-work"
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  backgroundColor: 'rgba(255,255,255,0.06)',
                                  border: '1px solid rgba(117,157,255,0.3)',
                                  borderRadius: '4px',
                                  color: '#81c784',
                                  fontSize: '12px',
                                  outline: 'none',
                                  boxSizing: 'border-box',
                                  fontFamily: 'monospace'
                                }}
                              />
                            </div>
                          </div>

                          <div>
                            <label className="settings-field-label">Website URL</label>
                            <input
                              aria-label={`Website URL for ${acc.name}`}
                              type="url"
                              value={editUrl}
                              onChange={(e) => setEditUrl(e.target.value)}
                              className="settings-text-input"
                            />
                          </div>

                          <div>
                            <label className="settings-field-label">Account Email / Google SSO Email</label>
                            <input
                              type="email"
                              value={editGoogleEmail}
                              onChange={(e) => setEditGoogleEmail(e.target.value)}
                              placeholder="e.g. user@gmail.com"
                              className="settings-text-input"
                            />
                            <span className="settings-field-help">
                              Used by Antigravity CLI (agy) and Google Cloud SDK to isolate this Gemini profile.
                            </span>
                          </div>

                          {/* Custom Environment Variables & Secrets for Edit */}
                          <div
                            style={{
                              padding: '10px 12px',
                              backgroundColor: 'rgba(255, 255, 255, 0.02)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '8px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px'
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <label
                                style={{
                                  fontSize: '11px',
                                  color: '#8baeff',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <Key size={12} /> Custom Environment Variables & Secrets (Encrypted)
                              </label>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const defaultKey =
                                      acc.providerId === 'claude'
                                        ? 'ANTHROPIC_API_KEY'
                                        : acc.providerId === 'chatgpt'
                                          ? 'OPENAI_API_KEY'
                                          : acc.providerId === 'gemini'
                                            ? 'GEMINI_API_KEY'
                                            : 'API_KEY'
                                    setEditEnvVars((prev) => [
                                      ...prev,
                                      { key: defaultKey, value: '', masked: true }
                                    ])
                                  }}
                                  style={{
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: 'rgba(117,157,255,0.12)',
                                    border: '1px solid rgba(117,157,255,0.3)',
                                    color: '#8baeff',
                                    cursor: 'pointer'
                                  }}
                                >
                                  + Add API Key
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditEnvVars((prev) => [
                                      ...prev,
                                      { key: '', value: '', masked: false }
                                    ])
                                  }
                                  style={{
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    color: '#ccc',
                                    cursor: 'pointer'
                                  }}
                                >
                                  + Add Variable
                                </button>
                              </div>
                            </div>

                            {editEnvVars.length === 0 ? (
                              <span
                                style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}
                              >
                                No custom environment variables configured.
                              </span>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {editEnvVars.map((item, idx) => (
                                  <div
                                    key={idx}
                                    style={{ display: 'flex', gap: '6px', alignItems: 'center' }}
                                  >
                                    <input
                                      value={item.key}
                                      onChange={(e) => {
                                        const val = e.target.value
                                        setEditEnvVars((prev) =>
                                          prev.map((it, i) =>
                                            i === idx ? { ...it, key: val } : it
                                          )
                                        )
                                      }}
                                      placeholder="VARIABLE_NAME"
                                      style={{
                                        width: '40%',
                                        padding: '4px 8px',
                                        backgroundColor: 'rgba(255,255,255,0.06)',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        borderRadius: '4px',
                                        color: '#8baeff',
                                        fontSize: '11px',
                                        fontFamily: 'monospace'
                                      }}
                                    />
                                    <input
                                      type={item.masked ? 'password' : 'text'}
                                      value={item.value}
                                      onChange={(e) => {
                                        const val = e.target.value
                                        setEditEnvVars((prev) =>
                                          prev.map((it, i) =>
                                            i === idx ? { ...it, value: val } : it
                                          )
                                        )
                                      }}
                                      placeholder="Secret value"
                                      style={{
                                        flex: 1,
                                        padding: '4px 8px',
                                        backgroundColor: 'rgba(255,255,255,0.06)',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        borderRadius: '4px',
                                        color: '#fff',
                                        fontSize: '11px',
                                        fontFamily: 'monospace'
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditEnvVars((prev) =>
                                          prev.map((it, i) =>
                                            i === idx ? { ...it, masked: !it.masked } : it
                                          )
                                        )
                                      }}
                                      title={item.masked ? 'Show value' : 'Hide value'}
                                      style={{
                                        padding: '4px 6px',
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#888',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      {item.masked ? <Eye size={13} /> : <EyeOff size={13} />}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditEnvVars((prev) => prev.filter((_, i) => i !== idx))
                                      }}
                                      title="Remove variable"
                                      style={{
                                        padding: '4px 6px',
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#e57373',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      <X size={13} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                            <button
                              onClick={() => setEditingAccountId(null)}
                              style={{
                                padding: '4px 10px',
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#aaa',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px'
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => updateAccountCredentials(acc)}
                              disabled={busyAccountId === acc.id}
                              style={{
                                padding: '4px 14px',
                                background: '#5579db',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 600
                              }}
                            >
                              {busyAccountId === acc.id ? 'Saving…' : 'Save Changes'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Tab 2: CLI Tools */}
          {activeTab === 'cli' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '14px'
                }}
              >
                <div>
                  <h5
                    style={{ margin: '0 0 3px', color: '#fff', fontSize: '13px', fontWeight: 600 }}
                  >
                    System CLI Coding Agents (BYOA)
                  </h5>
                  <p style={{ margin: 0, fontSize: '12px', color: '#9ba8b8' }}>
                    Tools installed on your Mac. These launch directly in terminal panes with your
                    isolated profiles.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  {
                    cmd: 'claude',
                    name: 'Claude Code CLI',
                    icon: '🧠',
                    pkg: '@anthropic-ai/claude-code',
                    desc: 'Anthropic agentic terminal tool. Supports Google login & CLAUDE_CONFIG_DIR.'
                  },
                  {
                    cmd: 'codex',
                    name: 'Codex CLI',
                    icon: '🤖',
                    pkg: '@openai/codex',
                    desc: "OpenAI's terminal coding agent. Supports ChatGPT login & CODEX_HOME."
                  },
                  {
                    cmd: 'agy',
                    name: 'Antigravity CLI (agy)',
                    icon: '🚀',
                    pkg: 'Google Antigravity',
                    desc: "Google's agentic terminal tool with native Google OAuth sign-in and profile isolation."
                  },
                  {
                    cmd: 'aider',
                    name: 'Aider',
                    icon: '⚡',
                    pkg: 'aider-chat',
                    desc: 'Git-aware AI pair programming in terminal.'
                  },
                  {
                    cmd: 'gh',
                    name: 'GitHub CLI',
                    icon: '🐙',
                    pkg: 'gh',
                    desc: 'GitHub repository tools in your terminal.'
                  }
                ].map((item) => {
                  const detected = detectedCLIs.find((d) => d.cmd === item.cmd)
                  // If item is claude, check if we have primary status
                  const primaryClaude = accounts.find((a) => a.providerId === 'claude')
                  const primaryClaudeStatus = primaryClaude
                    ? accountStatuses[primaryClaude.id]?.cliAuth
                    : undefined

                  return (
                    <div
                      key={item.cmd}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        backgroundColor: detected
                          ? 'rgba(76, 175, 80, 0.05)'
                          : 'rgba(255,255,255,0.02)',
                        border: detected
                          ? '1px solid rgba(76, 175, 80, 0.2)'
                          : '1px solid rgba(255,255,255,0.04)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '20px' }}>{item.icon}</span>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}>
                              {item.name}
                            </span>
                            <span
                              style={{
                                fontSize: '12px',
                                color: '#a3afbd',
                                fontFamily: 'monospace'
                              }}
                            >
                              ({item.cmd})
                            </span>
                            {item.cmd === 'claude' && primaryClaudeStatus?.loggedIn && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  color: '#81c784',
                                  backgroundColor: 'rgba(76,175,80,0.15)',
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  fontWeight: 500
                                }}
                              >
                                ● {primaryClaudeStatus.email}{' '}
                                {primaryClaudeStatus.subscriptionType
                                  ? `(${primaryClaudeStatus.subscriptionType.toUpperCase()})`
                                  : ''}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: '#9ba8b8', marginTop: '2px' }}>
                            {item.desc}
                          </div>
                          {detected && (
                            <div
                              style={{
                                fontSize: '11px',
                                color: '#81c784',
                                fontFamily: 'monospace',
                                marginTop: '3px'
                              }}
                            >
                              {detected.path}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {detected ? (
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '12px',
                              color: '#81c784',
                              fontWeight: 600
                            }}
                          >
                            <Check size={14} /> Ready
                          </span>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#888' }}>
                            Install: <code>npm i -g {item.pkg}</code>
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
