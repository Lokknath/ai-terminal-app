import { useState } from 'react'
import {
  ArrowUpRight,
  Activity,
  Bot,
  ChevronRight,
  ExternalLink,
  Compass,
  FolderOpen,
  Globe2,
  Plus,
  NotebookPen,
  Send,
  Settings2,
  TerminalSquare
} from 'lucide-react'
import { useApp } from '../store/AppContext'

interface AgentDashboardProps {
  onOpenAccount?: (account: { url: string; name: string; partition: string }) => void
  onNewBrowser: () => void
  onLaunchCLI: (command: string, name: string, folder: string) => void
}

const tools = [
  { id: 'claude-cli', cmd: 'claude', name: 'Claude Code', detail: 'Coding agent' },
  { id: 'codex-cli', cmd: 'codex', name: 'Codex CLI', detail: 'Coding agent' },
  { id: 'agy-cli', cmd: 'agy', name: 'Antigravity CLI', detail: 'Coding agent' },
  { id: 'gh-copilot', cmd: 'gh', name: 'GitHub CLI', detail: 'Repository tools' },
  { id: 'cursor-cli', cmd: 'cursor', name: 'Cursor Agent', detail: 'Fast code intelligence' }
]

export default function AgentDashboard({
  onOpenAccount,
  onNewBrowser,
  onLaunchCLI
}: AgentDashboardProps): JSX.Element {
  const { state, dispatch } = useApp()
  const [openError, setOpenError] = useState<string | null>(null)

  const launch = (command: string, name: string): void => {
    dispatch({
      type: 'OPEN_FOLDER_EXPLORER',
      title: `Select Working Directory for ${name}`,
      onSelect: (folder) => {
        onLaunchCLI(command, name, folder)
        dispatch({ type: 'SET_MODE', mode: 'code' })
      }
    })
  }

  return (
    <main className="agent-dashboard">
      {openError && (
        <div className="settings-feedback is-error" role="alert">
          {openError}
        </div>
      )}
      <div className="agent-dashboard-header">
        <div className="agent-hero-copy">
          <span className="section-overline">Nexus · your command center</span>
          <h1>Build with every agent in one place.</h1>
          <p>
            Pick a project, switch accounts, and keep your terminals and AI tools in one calm
            workspace.
          </p>
          <div className="agent-hero-stats" aria-label="Workspace overview">
            <span>
              <strong>{state.aiAccounts.length}</strong> accounts
            </span>
            <span>
              <strong>{state.detectedCLIs.length}</strong> installed tools
            </span>
            <span className="is-ready">
              <span className="agent-ready-dot" /> Workspace ready
            </span>
          </div>
        </div>
        <div className="agent-hero-side">
          <div className="agent-hero-orbit" aria-hidden="true">
            <span className="agent-orbit-core">
              <TerminalSquare size={25} />
            </span>
            <span className="agent-orbit-node is-claude">
              <Bot size={17} />
            </span>
            <span className="agent-orbit-node is-code">
              <Activity size={17} />
            </span>
            <span className="agent-orbit-node is-web">
              <Globe2 size={17} />
            </span>
          </div>
          <div className="dashboard-header-actions">
            <button
              type="button"
              className="dashboard-open-workspace"
              onClick={() => dispatch({ type: 'SET_MODE', mode: 'code' })}
            >
              Open workspace <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="dashboard-usage-link"
              onClick={() => dispatch({ type: 'SET_MODE', mode: 'usage' })}
            >
              <Activity size={15} /> View usage
            </button>
            <button
              type="button"
              className="dashboard-manage"
              onClick={() => dispatch({ type: 'SET_SHOW_SETTINGS', show: true })}
            >
              <Settings2 size={15} /> Manage accounts
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-tool-strip" aria-label="Workspace tools">
        <button type="button" onClick={() => dispatch({ type: 'SET_MODE', mode: 'code' })}>
          <TerminalSquare size={20} />
          <span>
            <strong>Code workspace</strong>
            <small>Terminals and agents</small>
          </span>
          <ChevronRight size={15} />
        </button>
        <button type="button" onClick={onNewBrowser}>
          <Compass size={20} />
          <span>
            <strong>Research browser</strong>
            <small>Explore without leaving</small>
          </span>
          <ChevronRight size={15} />
        </button>
        <button type="button" onClick={() => dispatch({ type: 'SET_MODE', mode: 'notes' })}>
          <NotebookPen size={20} />
          <span>
            <strong>Notes</strong>
            <small>Keep your ideas close</small>
          </span>
          <ChevronRight size={15} />
        </button>
        <button type="button" onClick={() => dispatch({ type: 'SET_MODE', mode: 'api' })}>
          <Send size={20} />
          <span>
            <strong>API Studio</strong>
            <small>Build and test requests</small>
          </span>
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="agent-dashboard-grid">
        <section className="dashboard-section" aria-labelledby="account-section-title">
          <div className="dashboard-section-header">
            <div>
              <Globe2 size={17} />
              <h2 id="account-section-title">Web accounts</h2>
              <span>{state.aiAccounts.length}</span>
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_SHOW_SETTINGS', show: true })}
            >
              <Plus size={14} /> Add
            </button>
          </div>
          {state.aiAccounts.length === 0 ? (
            <div className="dashboard-empty">
              <Globe2 size={24} />
              <strong>No accounts configured</strong>
              <p>Add one to keep its web session separate.</p>
            </div>
          ) : (
            <div className="dashboard-list">
              {state.aiAccounts.map((account) => (
                <div className="dashboard-row" key={account.id} data-provider={account.providerId}>
                  <div className="dashboard-account-mark" aria-hidden="true">
                    {account.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="dashboard-row-copy">
                    <strong>{account.name}</strong>
                    <small>
                      {account.providerId === 'gemini'
                        ? 'Google sign-in in browser'
                        : 'Isolated web session'}{' '}
                      · {account.url}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="dashboard-row-action"
                    title={`Open ${account.name} web pane`}
                    aria-label={`Open ${account.name} web pane`}
                    onClick={() => {
                      try {
                        onOpenAccount?.(account)
                        dispatch({ type: 'SET_MODE', mode: 'code' })
                      } catch {
                        setOpenError(`Could not open ${account.name} web pane.`)
                      }
                    }}
                  >
                    <ExternalLink size={15} />
                    <span>Open</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-section" aria-labelledby="cli-section-title">
          <div className="dashboard-section-header">
            <div>
              <TerminalSquare size={17} />
              <h2 id="cli-section-title">CLI tools</h2>
              <span>{state.detectedCLIs.length}</span>
            </div>
          </div>
          <div className="dashboard-list">
            {tools.map((tool) => {
              const installed = state.detectedCLIs.includes(tool.id)
              return (
                <div className="dashboard-row" key={tool.id}>
                  <div className="dashboard-tool-mark" aria-hidden="true">
                    <Bot size={16} />
                  </div>
                  <div className="dashboard-row-copy">
                    <strong>{tool.name}</strong>
                    <small>
                      {tool.detail} · {tool.cmd}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="dashboard-row-action"
                    disabled={!installed}
                    title={
                      installed
                        ? `Choose a project and launch ${tool.name}`
                        : `${tool.name} is not installed`
                    }
                    onClick={() => launch(tool.cmd, tool.name)}
                  >
                    <FolderOpen size={15} />
                    <span>{installed ? 'Launch' : 'Missing'}</span>
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <div className="agent-dashboard-note">
        <ArrowUpRight size={15} />
        <span>
          Each terminal uses the selected account profile; web sessions keep separate cookies.
        </span>
      </div>
    </main>
  )
}
