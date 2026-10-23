# Nexus Feature Catalog

Nexus is engineered as a modern command center for autonomous AI coding agents, terminal multiplexing, and API development. Below is an exhaustive catalog of all core features and tools.

---

## 📑 Feature Index

1. [Autonomous AI Agent Swarm Orchestration](#1-autonomous-ai-agent-swarm-orchestration)
2. [Universal Credential & Profile Isolation](#2-universal-credential--profile-isolation)
3. [Inter-Terminal Communication & SpeakDock](#3-inter-terminal-communication--speakdock)
4. [Folder-Scraped Sessions & Monotonic Numbering](#4-folder-scraped-sessions--monotonic-numbering)
5. [Intelligent Attention Center & 1-Click Approvals](#5-intelligent-attention-center--1-click-approvals)
6. [Resilient Terminal Multiplexing & Proportional Resizing](#6-resilient-terminal-multiplexing--proportional-resizing)
7. [Zero-Drift Developer Stopwatch](#7-zero-drift-developer-stopwatch)
8. [Dynamic Terminal Font Scaling](#8-dynamic-terminal-font-scaling)
9. [Safe Session Close Protection](#9-safe-session-close-protection)
10. [Sticky Top Focus Mode](#10-sticky-top-focus-mode)
11. [API Studio (cURL & Axios-Curl Runner)](#11-api-studio-curl--axios-curl-runner)
12. [Run-When-Away System Sleep Guard](#12-run-when-away-system-sleep-guard)
13. [Multi-Account Isolated Web Browser](#13-multi-account-isolated-web-browser)
14. [Integrated Notes Workspace](#14-integrated-notes-workspace)

---

## 1. Autonomous AI Agent Swarm Orchestration

- **Simultaneous Swarm Dispatch**: Broadcast commands across all running agent terminals or selectively target groups (e.g. all Gemini sessions, all Claude sessions).
- **Live State Telemetry**:
  - 🟢 **Working / Executing**: Agent actively synthesizing code, running test suites, or editing files.
  - 🟡 **Waiting on Input**: Agent blocked awaiting human confirmation or tool execution approval.
  - ⚪ **Idle**: Terminal idle and awaiting the next prompt.
- **Swarm Hotkey Navigation**: Use <kbd>↑</kbd> and <kbd>↓</kbd> arrows to cycle through running agents and <kbd>Space</kbd> or <kbd>Enter</kbd> to focus immediately.

---

## 2. Universal Credential & Profile Isolation

- **Independent Provider Profiles**: Run multiple Gemini, Claude Code, OpenAI Codex, or Ollama accounts simultaneously without configuration or token conflicts.
- **Dedicated Directory Structures**:
  - Gemini: `~/.gemini/antigravity-cli-<accountKey>/`
  - Claude: `~/.claude-<accountKey>.json`
  - Codex: `~/.codex-<accountKey>.json`
- **Encrypted Vault**: API keys and tokens are protected via hardware-backed operating system vaults (`safeStorage`).

---

## 3. Inter-Terminal Communication & SpeakDock

- **SpeakDock Interface**: Floating dock dedicated to cross-terminal messaging.
- **Buffer Piping**: Capture the trailing output of one terminal and pipe it directly as input to another.
  - *Example*: Pipe a TypeScript compilation error from Terminal 1 (Build) into Terminal 2 (Gemini Agent) for automated debugging.
- **Interactive Handoffs**: Transfer task context and prompt instructions seamlessly between agents.

---

## 4. Folder-Scraped Sessions & Monotonic Numbering

- **Workspace Scoping**: Launch any AI agent or terminal shell directly into any folder on your machine.
- **Directory Pills**: Interactive folder badge in every terminal header showing the current folder name with one-click clipboard copying.
- **Monotonic Sequential Numbering**: Terminals are numbered sequentially per folder (`#1`, `#2`, `#3`), ensuring unambiguous identification across layout changes.
- **Inline Session Renaming**: Double-click or click the edit icon on any session header or sidebar item to customize session names. Press <kbd>Enter</kbd> to save or <kbd>Esc</kbd> to discard.

---

## 5. Intelligent Attention Center & 1-Click Approvals

- **In-Pane Attention Action Banner**: High-visibility yellow banner appears the instant an agent prompts for command confirmation.
- **Instant Hotkey Approvals**: Press <kbd>y</kbd> to approve or <kbd>n</kbd> to deny without needing to click into the terminal prompt.
- **Toast Notifications with Focus Jump**: Global desktop notifications alert you when an agent requires attention while working in another tab or pane.

---

## 6. Resilient Terminal Multiplexing & Proportional Resizing

- **12 Responsive Layout Presets**:
  - Solo, 2-Column Split, 3-Column Swarm, 4-Quadrant Workbench, Focus + Side Stack, and Auto-Balanced layouts.
- **Proportional Drag Resizing**: 8-handle resizing allows resizing panes in any direction while preserving custom widths and heights.
- **Edge Snap Zones**: Drag terminal tabs to the edge of the viewport to instantly snap them into 50% split arrangements.

---

## 7. Zero-Drift Developer Stopwatch

- **Top Header Placement**: Stationed beside the IST clock in the header.
- **Wall-Clock Precision**: Zero drift across system sleeps or backgrounding using differential timestamps.
- **Controls**:
  - Single click to Start/Pause.
  - Double click or right click to Reset.
  - Interactive <kbd>RotateCcw</kbd> reset button.
  - Keyboard shortcuts (<kbd>Enter</kbd> / <kbd>Space</kbd> / <kbd>Esc</kbd>).
- **Persistent State**: Retains elapsed time across app restarts.

---

## 8. Dynamic Terminal Font Scaling

- **CLI Wrap Protection**: Prevents command line wrap corruption (common with Gemini or Claude CLI prompts) in narrow splits.
- Automatically adjusts terminal font down to 10px or 11px when pane width is narrow, expanding back to standard font size when pane width increases.

---

## 9. Safe Session Close Protection

- **Double-Check Confirmation Modal**: Closing an active terminal session displays an attractive verification dialog to prevent accidental data loss.
- Protects against terminating running agent swarms accidentally.

---

## 10. Sticky Top Focus Mode

- In **Focus Mode**, top session tabs remain permanently sticky at the top of the screen.
- Prevents annoying viewport scrolling when switching between active terminals in focused views.

---

## 11. API Studio (cURL & Axios-Curl Runner)

- **Multi-Line cURL Parser**: Parses raw, multi-line cURL commands with cookies, authentication tokens, and JSON payloads.
- **Axios Code Generator**: Converts raw requests into structured TypeScript/JavaScript Axios code with 1 click.
- **CORS-Free Execution**: Dispatches HTTP/HTTPS requests directly through Electron's main process, bypassing browser CORS restrictions.

---

## 12. Run-When-Away System Sleep Guard

- **PowerSaveBlocker Integration**: Keeps your operating system awake during lengthy agent operations (e.g. overnight test runs, large repo refactoring).
- **Manual Toggle**: Click the coffee cup (<kbd>☕</kbd>) icon in the status bar anytime to manually lock system awake mode.

---

## 13. Multi-Account Isolated Web Browser

- Concurrent browser tabs for Claude.ai, ChatGPT, and Gemini web interfaces.
- Isolated session partitions ensure separate logins without cross-account cookie collisions.
- Built-in Chromium Developer Tools integration.

---

## 14. Integrated Notes Workspace

- Fast markdown scratchpad beside your terminal grid.
- Instant auto-save to local storage with undo capability and 1-click Markdown export.
