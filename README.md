<div align="center">

# Nexus AI Terminal & Agent Swarm Workspace

**The autonomous AI agent command center, resilient terminal multiplexer, and API studio.**

[![Electron](https://img.shields.io/badge/Electron-44.5-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.3-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge)](LICENSE)
[![Author](https://img.shields.io/badge/Author-Loknath%20Surabhi-2563eb?style=for-the-badge&logo=github)](https://github.com/Lokknath)

<br />

<p align="center">
  <a href="#-key-features">Features</a> •
  <a href="#-quickstart--installation">Quickstart</a> •
  <a href="#-architecture--codebase-overview">Architecture</a> •
  <a href="#-keyboard-shortcuts-reference">Shortcuts</a> •
  <a href="#-documentation-sitemap">Documentation</a> •
  <a href="#-author--maintainer">Author</a>
</p>

</div>

---

## ⚡ Overview

**Nexus** is an autonomous AI agent command center, terminal multiplexer, and API studio engineered for developers orchestrating multi-agent swarms (**Google Gemini**, **Anthropic Claude Code**, **OpenAI Codex**, and **Ollama**) alongside web research and backend microservices.

Built with **Electron 44**, **React 19**, **TypeScript 5.9**, **xterm.js 5.3**, and **node-pty 1.1**, Nexus gives developers complete control over concurrent autonomous coding agents with hardware-encrypted credential isolation, cross-terminal buffer piping, real-time attention alerts, 1-click approvals, dynamic font scaling, zero-drift developer stopwatch, and system sleep prevention.

---

## 🌟 Key Features

### 1. Universal Credential & Profile Isolation
- **Simultaneous Provider Accounts**: Run concurrent Claude Code, OpenAI Codex, and Google Gemini sessions with zero credential leakage or OAuth token collisions.
- **Dedicated Sandbox Paths**:
  - **Gemini / Antigravity CLI**: Dynamically isolated to `~/.gemini/antigravity-cli-<accountKey>/`.
  - **Claude Code**: Sandboxed configuration in `~/.claude-<accountKey>.json`.
  - **OpenAI Codex**: Sandboxed profiles in `~/.codex-<accountKey>.json`.
- **Hardware-Encrypted Secrets**: API tokens and OAuth keys are encrypted using the operating system's native cryptographic vault via Electron `safeStorage` (Apple Keychain, Windows DPAPI, Linux Libsecret).
- 📖 *Read the deep-dive: [Universal Credential Isolation Guide](docs/UNIVERSAL_CREDENTIAL_ISOLATION.md)*.

### 2. Autonomous Swarm Orchestration & Telemetry
- **Swarm Command Runner**: Dispatch instructions across all active terminals simultaneously or target specific provider groups.
- **Real-Time Agent State Detection**:
  - 🟢 **Working / Executing**: Agent actively synthesizing code or running commands.
  - 🟡 **Waiting on Input**: Agent blocked awaiting human confirmation or tool execution approval.
  - ⚪ **Idle**: Session standing by ready for tasks.
- **Interactive Swarm Navigation**: Cycle through active agents using <kbd>↑</kbd> / <kbd>↓</kbd> arrows and switch focus with <kbd>Space</kbd> or <kbd>Enter</kbd>.

### 3. Inter-Terminal Communication & SpeakDock
- **SpeakDock Hub**: Dedicated floating communication hub for inter-terminal orchestration.
- **Buffer Piping**: Select any source terminal and pipe its recent output or error trace directly into another terminal as prompt input (e.g. pipe a build error from Claude into Gemini for instant debugging).
- **Agent Handoffs**: Transfer tasks and context seamlessly between different models.
- 📖 *Read the deep-dive: [Inter-Terminal Communication Guide](docs/INTER_TERMINAL_COMMUNICATION.md)*.

### 4. Resilient Multiplexing & Proportional Resizing
- **12 Responsive Layout Presets**: Solo, 2-Column Split, 3-Column Swarm, 4-Quadrant Workbench, Focus + Side Stack, and Auto-Balanced grids.
- **Multi-Directional Drag Resizing**: 8-handle drag resizing preserves custom pane proportions across layout toggles.
- **Dynamic Terminal Font Scaling**: Automatically scales terminal font size down (to 10px or 11px) in narrow split panes, completely eliminating ANSI prompt wrapping corruption with the Gemini / Claude CLIs.
- **Sticky Top Focus Mode**: In single-terminal focus mode, navigation tabs remain permanently pinned at the top without vertical scrolling.

### 5. Folder-Scraped Sessions & Monotonic Numbering
- **Scoped Directory Sessions**: Launch any AI agent or shell directly into any folder on your machine from the header or modal.
- **Interactive Folder Pills**: Terminal headers feature an interactive badge showing the folder name with 1-click path copying.
- **Monotonic Terminal Numbering**: Terminals are numbered sequentially per folder (`#1`, `#2`, `#3`) for unambiguous referencing.
- **Inline Session Renaming**: Double-click any tab or pane header to rename it on the fly (<kbd>Enter</kbd> to save, <kbd>Esc</kbd> to discard).

### 6. Zero-Drift Developer Stopwatch
- **Top Header Station**: Positioned directly beside the India Standard Time (IST) clock.
- **Wall-Clock Precision**: Uses differential timestamps (`Date.now() - startTime`) ensuring zero drift across app restarts, sleep cycles, or tab switching.
- **Intuitive Controls**:
  - Single click to **Start / Pause**.
  - Double-click or right-click to **Reset** (`00:00`).
  - Inline hover reset button.
  - Keyboard accessible (<kbd>Enter</kbd>, <kbd>Space</kbd>, <kbd>Esc</kbd>).

### 7. Intelligent Attention Center & 1-Click Approvals
- **In-Pane Attention Action Banner**: High-visibility yellow banner appears the instant an agent prompts for command confirmation.
- **Instant Hotkey Approvals**: Press <kbd>y</kbd> to approve or <kbd>n</kbd> to deny without having to type into terminal prompts.
- **Safe Session Close Modal**: Attractive confirmation dialog prevents accidental termination of active coding agents.

### 8. API Studio (cURL & Axios-Curl Runner)
- **Multi-Line cURL Parsing**: Parse complex multi-line cURL commands with cookies, authentication headers, and JSON payloads.
- **Axios Code Converter**: 1-click conversion between raw cURL and structured Axios TypeScript/JavaScript code snippets.
- **CORS-Free Execution**: Dispatches HTTP/HTTPS requests directly through Electron's main process, bypassing browser CORS restrictions.

### 9. Run-When-Away Sleep Prevention
- **System Power Guard**: Uses Electron's native `powerSaveBlocker` to automatically prevent system sleep while any agent in the swarm is working.
- **Manual Toggle**: One-click coffee cup (<kbd>☕</kbd>) icon in the status bar to toggle keep-awake mode at will.

### 10. Multi-Account Isolated Web Browser & Notes
- **Partition Isolation**: Run separate, concurrent logins for Claude.ai, ChatGPT, and Google Gemini using isolated Electron session partitions (`persist:account-<id>`).
- **Markdown Scratchpad**: Integrated local notes workspace with 1-click clipboard export.

---

## ⌨️ Keyboard Shortcuts Reference

| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| <kbd>⌘</kbd> + <kbd>K</kbd> | Toggle Command Palette / Search | Global |
| <kbd>⌘</kbd> + <kbd>1</kbd> | Switch to **Code** Workspace | Global |
| <kbd>⌘</kbd> + <kbd>2</kbd> | Switch to **Agent Swarm** Mode | Global |
| <kbd>⌘</kbd> + <kbd>3</kbd> | Switch to **AI Chat** Workspace | Global |
| <kbd>⌘</kbd> + <kbd>4</kbd> | Switch to **API Studio** | Global |
| <kbd>⌘</kbd> + <kbd>5</kbd> | Switch to **Notes** Workspace | Global |
| <kbd>⌘</kbd> + <kbd>B</kbd> | Toggle Left Sidebar | Global |
| <kbd>⌘</kbd> + <kbd>T</kbd> | Open New Terminal | Global |
| <kbd>⌘</kbd> + <kbd>W</kbd> | Close Current Pane (with active protection modal) | Global |
| <kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>F</kbd> | Toggle Fullscreen / Maximize Active Pane | Global |
| <kbd>⌘</kbd> + <kbd>]</kbd> / <kbd>[</kbd> | Cycle Next / Previous Pane | Global |
| <kbd>⌘</kbd> + <kbd>+</kbd> / <kbd>-</kbd> / <kbd>0</kbd> | Zoom In / Zoom Out / Reset Terminal Font | Global |
| <kbd>y</kbd> / <kbd>n</kbd> | **Approve** / **Deny** current blocked agent command | Active Waiting Terminal |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Navigate Swarm Agent List | Swarm Controls |
| <kbd>Space</kbd> / <kbd>Enter</kbd> | Focus Selected Swarm Agent | Swarm Controls |

> *(Note: On Windows and Linux, use <kbd>Ctrl</kbd> in place of <kbd>⌘</kbd>).*  
> 📖 *Full reference: [Keyboard Shortcuts Guide](docs/KEYBOARD_SHORTCUTS.md)*.

---

## 🚀 Quickstart & Installation

### Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **C/C++ Build Tools**: Required for `node-pty` native compilation:
  - **macOS**: `xcode-select --install`
  - **Linux**: `sudo apt install build-essential python3`
  - **Windows**: Visual Studio C++ Build Tools

### Installation & Development
```bash
# 1. Clone the repository
git clone https://github.com/Lokknath/ai-terminal-app.git
cd ai-terminal-app

# 2. Install dependencies
npm install

# 3. Launch in development mode with HMR
npm run dev
```

### Packaging Desktop Binaries
```bash
# Package for macOS (.dmg, .zip)
npm run build:mac

# Directly deploy to local macOS /Applications
npm run deploy:mac

# Package for Linux (.AppImage, .deb)
npm run build:linux
```

---

## 🏗️ Architecture & Codebase Overview

```text
ai-terminal-app/
├── docs/                        # In-depth architectural & feature guides
├── github-profile/              # Author's personalized GitHub Profile README
├── resources/                   # Desktop icons & build assets
├── src/
│   ├── main/                    # Electron Main Process (Supervisor)
│   │   ├── index.ts             # App lifecycle, single-instance lock, window frame
│   │   ├── pty-manager.ts       # node-pty pseudo-terminal session manager & streaming
│   │   ├── account-manager.ts   # Hardware-encrypted credential storage (safeStorage)
│   │   ├── api-client.ts        # CORS-free HTTP engine & cURL executor
│   │   └── usage-limits.ts      # Token usage and rate-limit scrapers
│   ├── preload/                 # Secure Context Isolation Bridge
│   │   ├── index.ts             # Exposes narrow window.api & window.electron
│   │   └── index.d.ts           # TypeScript IPC contract definitions
│   └── renderer/                # React 19 Frontend
│       └── src/
│           ├── App.tsx          # Workspace shell, layout engine & routing
│           ├── components/      # UI components (TerminalPane, HeaderBar, StatusBar, SpeakDock, etc.)
│           ├── store/           # Global React Context & AppState (AppContext.tsx)
│           └── assets/          # Theme stylesheets and layout definitions
```

📖 *Read the deep-dive: [Architecture Documentation](docs/ARCHITECTURE.md)*.

---

## 📚 Documentation Sitemap

- [System Architecture](docs/ARCHITECTURE.md)
- [Complete Feature Catalog](docs/FEATURES.md)
- [Universal Credential & Profile Isolation](docs/UNIVERSAL_CREDENTIAL_ISOLATION.md)
- [Inter-Terminal Communication & SpeakDock](docs/INTER_TERMINAL_COMMUNICATION.md)
- [Keyboard Shortcuts Reference](docs/KEYBOARD_SHORTCUTS.md)
- [Contributing Guidelines](docs/CONTRIBUTING.md)
- [Personal GitHub Profile Setup](docs/GITHUB_PROFILE_SETUP.md)

---

## 🔒 Security & Privacy Model

- **Zero Remote Telemetry**: Nexus runs 100% locally on your machine. No terminal output, telemetry, keystrokes, or code files are ever sent to any remote servers.
- **Hardware-Encrypted Storage**: Sensitive API keys and authentication tokens are encrypted using the operating system's native cryptographic vault via Electron `safeStorage`.
- **Session Partitioning**: Web views run in isolated Electron session partitions (`persist:account-<id>`), isolating cookies, local storage, and caches between accounts.
- **Process Singleton Resilience**: Automated inspection and cleanup of stale POSIX socket locks prevents mach port traps and multi-process corruption on abrupt shutdowns.

---

## 👤 Author & Maintainer

<table border="0">
  <tr>
    <td align="center" width="120">
      <a href="https://github.com/Lokknath">
        <img src="https://github.com/Lokknath.png" width="100px;" alt="Loknath Surabhi" style="border-radius: 50%;" />
      </a>
    </td>
    <td>
      <strong>Loknath Surabhi</strong><br />
      <em>Full-Stack Systems Architect & AI Tooling Engineer</em><br />
      GitHub: <a href="https://github.com/Lokknath">@Lokknath</a><br />
      Email: <a href="mailto:slokknath@gmail.com">slokknath@gmail.com</a>
    </td>
  </tr>
</table>

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
