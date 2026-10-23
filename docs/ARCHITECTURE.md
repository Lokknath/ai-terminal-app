# Nexus Architecture Documentation

This document provides a comprehensive technical overview of the **Nexus** system architecture, component topology, inter-process communication (IPC) contracts, and credential isolation model.

---

## 1. System Topology Overview

Nexus is built on top of **Electron 44**, **React 19**, **TypeScript 5.9**, **xterm.js 5.3**, and **node-pty 1.1**. It follows a security-hardened multi-process architecture consisting of three primary tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Electron Main Process                         │
│  ┌───────────────────┐  ┌──────────────────┐  ┌─────────────────────┐  │
│  │    PTY Manager    │  │ Account Manager  │  │   API HTTP Engine   │  │
│  │ (node-pty streams)│  │  (safeStorage)   │  │   (CORS-free cURL)  │  │
│  └─────────┬─────────┘  └────────┬─────────┘  └──────────┬──────────┘  │
│            │                     │                       │             │
│  ┌─────────┴─────────────────────┴───────────────────────┴──────────┐  │
│  │                       IPC Dispatcher & Router                    │  │
│  └───────────────────────────────────┬──────────────────────────────┘  │
└──────────────────────────────────────┼─────────────────────────────────┘
                                       │ IPC Bridges (contextBridge)
┌──────────────────────────────────────┼─────────────────────────────────┐
│                          Preload Secure Bridge                         │
│  ┌───────────────────────────────────┴──────────────────────────────┐  │
│  │          window.api (Narrowly-typed asynchronous contracts)      │  │
│  └───────────────────────────────────┬──────────────────────────────┘  │
└──────────────────────────────────────┼─────────────────────────────────┘
                                       │ React Hooks & State Context
┌──────────────────────────────────────┼─────────────────────────────────┐
│                      Renderer Process (React 19 UI)                    │
│  ┌───────────────────┐  ┌──────────────────┐  ┌─────────────────────┐  │
│  │   Terminal Grid   │  │    Swarm Center  │  │  Developer Controls │  │
│  │ (xterm.js + fit)  │  │ (Telemetry & Bus)│  │ (Stopwatch, Layouts)│  │
│  └───────────────────┘  └──────────────────┘  └─────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Process Separation & Security Boundaries

### 2.1 The Main Process (`src/main/`)
The main process acts as the supervisor and runtime kernel:
- **Operating System Lifecycle**: Manages single-instance locks, window creation, macOS traffic light positioning, and graceful POSIX process shutdown.
- **Pseudo-Terminal Management (`pty-manager.ts`)**: Creates, monitors, and streams bidirectional data from `node-pty` pseudo-terminals with non-blocking I/O.
- **Hardware-Encrypted Account Store (`account-manager.ts`)**: Manages API credentials, OAuth tokens, and profile directory paths using Electron's `safeStorage` (Apple Keychain on macOS, DPAPI on Windows, Libsecret on Linux).
- **CORS-Free HTTP Engine (`api-client.ts`)**: Directly dispatches cURL-compatible HTTP/HTTPS requests from the main process, bypassing browser CORS restrictions.
- **Power Management**: Integrates Electron's `powerSaveBlocker` to prevent system sleep while autonomous AI agents are executing.

### 2.2 The Preload Bridge (`src/preload/`)
- Adheres strictly to **Context Isolation** (`contextIsolation: true`) and disables **Node Integration** (`nodeIntegration: false`) in the renderer.
- Exposes a typed API facade via `window.api` using Electron's `contextBridge.exposeInMainWorld`.
- Ensures the renderer cannot execute arbitrary system calls, read arbitrary files outside authorized scopes, or manipulate parent process handles directly.

### 2.3 The Renderer Process (`src/renderer/`)
- Built with **React 19**, **TypeScript**, and modular component patterns.
- Global application state is orchestrated via `AppContext.tsx` using a unified action-dispatch model (`useApp()`).
- Renders high-performance terminal panes using **xterm.js** with canvas/webgl acceleration and the `@xterm/addon-fit` layout adapter.

---

## 3. Universal Credential & Profile Isolation

One of Nexus's flagship architectural innovations is **Universal Credential Isolation**. Running concurrent coding agents from multiple providers (Google Gemini, Anthropic Claude, OpenAI Codex) often causes credential collisions when agents rely on shared user-home configuration files (e.g., `~/.gemini/`, `~/.claude.json`, `~/.codex/`).

Nexus eliminates collisions by establishing dedicated sandboxed environments for each account:

### 3.1 Per-Provider Isolation Strategies

1. **Google Gemini & Antigravity CLI**:
   - Environment Overrides: `GEMINI_CLI_HOME`, `ANTIGRAVITY_CONFIG_DIR`, `GEMINI_API_KEY`.
   - Dedicated isolated profile root: `~/.gemini/antigravity-cli-<accountKey>/`.
   - Prevents active OAuth token overwrites when running simultaneous Gemini terminals.

2. **Claude Code (Anthropic)**:
   - Environment Overrides: `CLAUDE_CONFIG_DIR`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`.
   - Dedicated configuration file: `~/.claude-<accountKey>.json`.

3. **OpenAI Codex & ChatGPT CLI**:
   - Environment Overrides: `CODEX_HOME`, `OPENAI_API_KEY`, `OPENAI_ORG_ID`.
   - Dedicated profile store: `~/.codex-<accountKey>.json`.

### 3.2 Dynamic Process Environment Spawning
When a terminal session launches:
```ts
// Pseudocode of environment synthesis in pty-manager.ts
const isolatedEnv = {
  ...process.env,
  ...getProviderProfileEnv(account),
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
  NEXUS_SESSION_ID: terminalId,
  NEXUS_WORKSPACE_DIR: workingDirectory
}
```
Every spawned `node-pty` instance inherits strictly isolated environment variables, ensuring zero cross-contamination.

---

## 4. Inter-Terminal Communication & SpeakDock

Nexus provides real-time inter-terminal messaging, prompt piping, and agent handoffs:

```
┌─────────────────────┐                          ┌─────────────────────┐
│ Terminal 1 (Claude) │                          │ Terminal 2 (Gemini) │
└──────────┬──────────┘                          └──────────▲──────────┘
           │                                                │
           │  1. Send Prompt / Pipe Buffer                  │
           └────────────────► ┌───────────────────┐ ────────┘
                              │     SpeakDock     │
                              │ (Message Bus/IPC) │
                              └───────────────────┘
```

1. **SpeakDock Floating Controller**: An interactive floating dock enabling developers to select a source terminal, select target terminals, and dispatch structured prompts or outputs.
2. **Buffer Piping**: Allows one-click capture of the last *N* lines or exit output from an agent (e.g., build failure logs from Claude) and pipes them directly into another agent (e.g., Gemini for code analysis).
3. **Monotonic Terminal Numbering**: Terminals maintain predictable folder-scoped sequential numbering (`#1`, `#2`, `#3`), simplifying CLI addressing and cross-referencing.

---

## 5. Resilient Terminal Multiplexing & Layout Engine

### 5.1 Dynamic Font Scaling
When terminals are tiled into narrow split layouts (e.g., 3-column or 4-quadrant views), command-line user interfaces (such as the Gemini or Claude CLI prompts) can suffer from ANSI wrapping glitches if the pane width falls below 80 columns.
Nexus features an automatic **dynamic font scaler**:
- Monitors each pane's dimensions via `ResizeObserver`.
- Smoothly reduces terminal font size (down to 10px or 11px) in narrow panes to preserve minimum standard column width.
- Dynamically restores standard font sizes when the pane is expanded or maximized.

### 5.2 Multi-Directional Proportional Resizing
- 8-handle drag resizing allows adjusting pane heights and widths dynamically.
- Custom width proportions are preserved in state, so switching between views or adding/removing panes retains customized proportions.

---

## 6. Zero-Drift Developer Stopwatch

Integrated directly into the header alongside the India Standard Time (IST) clock:
- **Zero-Drift Architecture**: Uses wall-clock differential time:
  $$\text{Elapsed} = \text{AccumulatedMs} + (\text{Date.now()} - \text{StartTime})$$
- **Persistence**: State is mirrored into `localStorage` under `nexus_stopwatch_state`. If the application restarts, computer sleeps, or the user switches workspaces, the timer retains exact elapsed time without losing a single second.
- **Controls**:
  - Single click: Start / Pause toggle.
  - Double click or right click: Instant reset to `00:00`.
  - Inline reset button: Quick reset on hover.
  - Keyboard shortcuts: <kbd>Enter</kbd> / <kbd>Space</kbd> to toggle, <kbd>Esc</kbd> to reset.

---

## 7. Security & Privacy Guarantees

1. **Zero Remote Telemetry**: All terminal I/O, agent communications, and scratchpad data remain strictly on your local machine.
2. **Hardware-Backed Encryption**: Secret keys are safeguarded by OS-level encryption keys via Electron `safeStorage`.
3. **Sandboxed Web Views**: Internal web chat panes use isolated session partitions (`persist:account-<id>`) preventing cookie leakage across profiles.
4. **POSIX Socket Cleanup**: Built-in socket sanitation cleans up abandoned socket handles upon process restart, preventing Mach port exhaustion on macOS.
