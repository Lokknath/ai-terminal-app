# Universal Credential & Profile Isolation in Nexus

This guide explains how Nexus achieves **Universal Credential Isolation** across multiple AI providers (Google Gemini, Anthropic Claude, OpenAI Codex, and Ollama) without environment leaks or OAuth token collisions.

---

## The Multi-Account Conflict Problem

Modern autonomous coding CLI agents store authentication tokens, project sessions, and preferences in fixed default file paths in the user's home directory:
- **Google Gemini / Antigravity CLI**: `~/.gemini/`
- **Claude Code**: `~/.claude.json` and `~/.claude/`
- **OpenAI Codex**: `~/.codex/` and environment variables

When developers attempt to run concurrent terminals with different accounts (e.g. personal vs. work subscription, or team pool accounts), standard terminal emulators overwrite tokens in real time, causing:
1. "Session expired / Invalid grant" authentication errors.
2. Silent cross-billing to the wrong subscription.
3. Loss of project memory and preferences across accounts.

---

## How Nexus Solves It

Nexus decouples each account into its own isolated profile sandbox within the OS:

```
User Home (~/)
├── .gemini/
│   ├── antigravity-cli-personal/     <── Profile Sandbox A (Personal)
│   └── antigravity-cli-work/         <── Profile Sandbox B (Work)
├── .claude-personal.json             <── Isolated Auth A
├── .claude-work.json                 <── Isolated Auth B
└── .codex-personal.json              <── Isolated Auth A
```

### 1. Isolated File Descriptors and Storage Roots
For every registered account in Nexus, a dedicated directory structure and configuration target is dynamically provisioned.

### 2. Isolated Environment Variable Injection
When Nexus spawns a new terminal session via `node-pty`, it constructs a clean environment map inheriting base system binaries while overriding provider-specific path variables:

```ts
// Example: Google Gemini profile environment injection
env['GEMINI_CLI_HOME'] = `/Users/${user}/.gemini/antigravity-cli-${account.id}`
env['ANTIGRAVITY_CONFIG_DIR'] = `/Users/${user}/.gemini/antigravity-cli-${account.id}`
if (account.apiKey) {
  env['GEMINI_API_KEY'] = account.apiKey
}

// Example: Claude Code profile environment injection
env['CLAUDE_CONFIG_DIR'] = `/Users/${user}/.claude-${account.id}`
if (account.apiKey) {
  env['ANTHROPIC_API_KEY'] = account.apiKey
}

// Example: OpenAI Codex profile environment injection
env['CODEX_HOME'] = `/Users/${user}/.codex-${account.id}`
if (account.apiKey) {
  env['OPENAI_API_KEY'] = account.apiKey
}
```

### 3. Hardware-Backed Encryption (`safeStorage`)
Account secrets, API keys, and bearer tokens are never stored in plaintext JSON files. Nexus leverages Electron's `safeStorage` API:
- **macOS**: Apple Keychain Services.
- **Windows**: Data Protection API (DPAPI).
- **Linux**: Secret Service API / Libsecret.

---

## Launching Isolated Accounts

You can launch an isolated account session from multiple convenient touchpoints:
1. **Header New Menu (`+`)**: Click the provider dropdown and pick any saved account profile.
2. **New Panel Modal (<kbd>⌘N</kbd>)**: Select the account and pick the target project folder.
3. **Agent Sidebar**: Click any configured account card to immediately open a new isolated terminal.
4. **Command Palette (<kbd>⌘K</kbd>)**: Search for the account name and press <kbd>Enter</kbd>.
