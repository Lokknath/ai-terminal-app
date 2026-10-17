# Nexus AI Terminal & Agent Swarm Workspace

[![Electron](https://img.shields.io/badge/Electron-44.5-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.2-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Nexus** is an autonomous AI agent workspace, terminal multiplexer, and API studio built for engineers running multi-agent swarms (Claude Code, OpenAI Codex, Google Gemini, Ollama) alongside web research and backend services.

Built with **Electron**, **React 19**, **TypeScript**, **xterm.js**, and **node-pty**, Nexus gives developers complete control over concurrent autonomous coding agents with intelligent attention alerts, 1-click approvals, resilient terminal multiplexing, and system sleep prevention.

---

## Key Features

### 1. Autonomous AI Agent Swarm Orchestration
- **Swarm Command Runner**: Dispatch commands across all active terminals simultaneously or target specific agent subsets.
- **Interactive Keyboard Swarm Navigation**: Navigate through running agents using <kbd>↑</kbd> / <kbd>↓</kbd> arrows and activate sessions instantly with <kbd>Space</kbd> or <kbd>Enter</kbd>.
- **Live Agent Telemetry**: Automatic regex & output pattern detection identifying agent states in real time:
  - 🟢 **Working / Executing**: Agent actively generating code or running commands.
  - 🟡 **Waiting on Input**: Agent blocked waiting for command execution approval or user prompt.
  - ⚪ **Idle**: Session standing by ready for tasks.

### 2. Intelligent Attention Center & Instant 1-Click Approvals
- **In-Pane Attention Action Banner**: Prominent visual banner when an agent requires execution confirmation.
- **Direct Hotkey Approvals**: Press <kbd>y</kbd> to immediately approve or <kbd>n</kbd> to deny without having to type into terminal prompts.
- **Attention Notification Center**: Interactive toast notifications for blocked agents with 1-click focus switching directly to the waiting terminal.

### 3. Modern Ergonomics & Responsive Status Bar
- **Raycast-Style Command Menu (<kbd>⌘K</kbd>)**: Centered fast launcher to search commands, execute layouts, launch CLIs, and switch workspaces.
- **Unified 26px Bottom Status Bar**:
  - Live session counter and swarm status pill with 1-click jump to blocked terminals.
  - Active terminal Working Directory (CWD) pill with 1-click clipboard copy and feedback.
  - Active AI Provider & Account badge (`🧠 Claude Code`, `🤖 ChatGPT`, `💎 Gemini`, `🌐 System Shell`).
  - Direct keyboard shortcut indicators (<kbd>⌘K</kbd>, <kbd>⌘B</kbd>, <kbd>⌘⇧F</kbd>, <kbd>☕ Keep-Awake</kbd>).

### 4. Resilient Terminal Multiplexing & Drag-and-Drop Tiling
- **Responsive Grid & Snap Layouts**: Dynamic 12-column grid system with Solo, 2-Column Split, 3-Column Swarm, 4-Tile, and Focus+Tile layouts.
- **Edge Snap Drop Zones**: Drag pane headers to screen edges to snap into Left 50%, Right 50%, Top 50%, Bottom 50%, or Dock to Sidebar.
- **Streamlined Pane Header with `•••` More Menu**: Clean, uncrowded toolbar with quick actions (Send Enter, Paste Clipboard, Paste & Run, Copy All Output, Clear, Zoom Font `A-`/`A+`, Resize Width 100/67/50/33%, and Dock Dev Preview).

### 5. Run-When-Away Sleep Prevention
- **System Power Guard**: Uses Electron's native `powerSaveBlocker` to automatically prevent macOS and Windows system sleep while any agent in the swarm is actively working.
- **Manual Toggle**: One-click coffee cup (<kbd>☕</kbd>) icon in the status bar to toggle keep-awake mode at will.

### 6. Full cURL & Axios-Curl Request Runner (API Studio)
- **Multi-Line cURL Parsing**: Parse complex multi-line cURL commands with cookies (`-b`), custom headers (`-H`), body payload, and authentication tokens.
- **Axios Code Converter**: 1-click conversion between raw cURL and structured Axios JavaScript/TypeScript code snippets.
- **CORS-Free Native HTTP Client**: Direct main-process execution allowing API requests without browser CORS restrictions.

### 7. Isolated Multi-Account Web Browser
- **Partition Isolation**: Run separate, concurrent logins for Claude.ai, ChatGPT, and Google Gemini using isolated Electron session partitions (`persist:account-<id>`).
- **DevTools Integration**: Open Chromium Developer Tools with one click on any web pane to inspect network traffic.

### 8. Built-in Notes Workspace
- Searchable Markdown scratchpad beside your terminals.
- Instant local persistence with undo capability and 1-click Markdown clipboard export.

---

## Keyboard Shortcuts Reference

| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| <kbd>⌘</kbd> + <kbd>K</kbd> | Toggle Command Palette / Search | Global |
| <kbd>⌘</kbd> + <kbd>1</kbd> | Switch to **Agents** Mode | Global |
| <kbd>⌘</kbd> + <kbd>2</kbd> | Switch to **Code** Workspace | Global |
| <kbd>⌘</kbd> + <kbd>3</kbd> | Switch to **AI Chat** Workspace | Global |
| <kbd>⌘</kbd> + <kbd>4</kbd> | Switch to **Usage** Dashboard | Global |
| <kbd>⌘</kbd> + <kbd>5</kbd> | Switch to **Notes** Workspace | Global |
| <kbd>⌘</kbd> + <kbd>6</kbd> | Switch to **API Studio** | Global |
| <kbd>⌘</kbd> + <kbd>B</kbd> | Toggle Left Sidebar | Global |
| <kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>F</kbd> | Toggle Fullscreen / Maximize Active Pane | Global |
| <kbd>⌘</kbd> + <kbd>T</kbd> | Open New Terminal | Global |
| <kbd>⌘</kbd> + <kbd>W</kbd> | Close Current Pane (with active agent protection) | Global |
| <kbd>⌘</kbd> + <kbd>]</kbd> / <kbd>[</kbd> | Cycle Next / Previous Pane | Global |
| <kbd>⌘</kbd> + <kbd>+</kbd> / <kbd>-</kbd> / <kbd>0</kbd> | Zoom In / Zoom Out / Reset Terminal Font | Global |
| <kbd>y</kbd> | **Approve** current blocked command | Active Waiting Terminal |
| <kbd>n</kbd> | **Deny** current blocked command | Active Waiting Terminal |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Navigate Swarm Agent List | Swarm Controls |
| <kbd>Space</kbd> / <kbd>Enter</kbd> | Focus Selected Swarm Agent | Swarm Controls |

*(Note: On Windows and Linux, use <kbd>Ctrl</kbd> in place of <kbd>⌘</kbd>).*

---

## Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **C/C++ Build Tools**: Required by `node-pty` native compilation:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `build-essential` and `python3`
  - **Windows**: Visual Studio C++ Build Tools or `windows-build-tools`

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Lokknath/ai-terminal-app.git
   cd ai-terminal-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   *(If `node-pty` requires rebuilding for your local Electron version, run `npm run postinstall`).*

3. **Launch in development mode:**
   ```bash
   npm run dev
   ```

### Building Desktop Installers

To package Nexus into native distributable binaries for your operating system:

```bash
# Build for macOS (.dmg, .zip)
npm run build:mac

# Build for Windows (.exe installer)
npm run build:win

# Build for Linux (.AppImage, .deb)
npm run build:linux
```

Outputs will be generated in the `dist/` directory.

---

## Architecture & Codebase Overview

```text
ai-terminal-app/
├── src/
│   ├── main/                    # Electron Main Process
│   │   ├── index.ts             # App lifecycle, single-instance lock, window management
│   │   ├── pty-manager.ts       # node-pty pseudo-terminal session manager & streaming
│   │   ├── account-manager.ts   # Secure credential storage with Electron safeStorage
│   │   ├── api-client.ts        # CORS-free HTTP engine & cURL executor
│   │   └── usage-limits.ts      # Token usage and rate-limit scrapers
│   ├── preload/                 # Secure Context Isolation Bridge
│   │   ├── index.ts             # Exposes narrow window.api & window.electron
│   │   └── index.d.ts           # TypeScript IPC contract definitions
│   └── renderer/                # React 19 Frontend
│       ├── src/
│       │   ├── App.tsx          # Workspace shell, responsive grid & keyboard routing
│       │   ├── components/      # UI components (TerminalPane, HeaderBar, StatusBar, etc.)
│       │   ├── store/           # Global React Context & AppState
│       │   └── assets/          # Theme stylesheets and layout definitions
```

---

## Security & Privacy Model

- **Zero Remote Telemetry**: Nexus runs entirely locally on your machine. No terminal output, telemetry, keystrokes, or code files are ever sent to any third-party servers.
- **Hardware-Encrypted Storage**: Sensitive API keys and authentication tokens are encrypted using the operating system's native cryptographic vault via Electron `safeStorage` (Keychain on macOS, DPAPI on Windows, Secret Service on Linux).
- **Session Partitioning**: Web views run in isolated Electron session partitions, isolating cookies, local storage, and caches between accounts.
- **Process Singleton Resilience**: Automated inspection and cleanup of stale POSIX socket locks prevents mach port traps and multi-process corruption on abrupt shutdowns.

---

## Contributing

Contributions, issues, and feature suggestions are welcome!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: Add AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
