# AI Terminal Multiplexer

A next-generation, hyper-modern terminal emulator and multiplexer built with **Electron**, **React**, and **Xterm.js**. Designed for the AI era, this terminal allows you to spawn multiple grid-based shell sessions, assign individual AI providers to different panes, and orchestrate complex workflows through a beautiful, glassmorphic UI.

## Features

- 🪟 **Tiling Window Grid**: Drag, drop, and resize terminal panes natively.
- 🎨 **Glassmorphism UI**: A gorgeous dark theme with frosted glass headers, smooth CSS animations, and `lucide-react` icons.
- ⌘ **Command Palette**: A Spotlight/Raycast-style floating modal for spawning new instances.
- 📂 **Directory Injection**: Select exactly which folder a new shell boots into before spawning it.
- 🤖 **AI Provider Binding**: Visually assign ChatGPT, Claude, or Antigravity AI to specific terminal sessions.
- 🔄 **Live Refresh**: Instantly wipe and restart a hung PTY process directly from the UI header without losing your grid spot.
- 📐 **Layout Toolbelt**: 1-click presets to snap your windows into a `2x2 Grid`, `Vertical Split`, `Horizontal Split`, `Sidebar Layout`, or `3-Column` setup.

## Tech Stack

- **Framework**: Electron (Vite + React)
- **Terminal Emulator**: `xterm.js` & `xterm-addon-fit`
- **Native PTY**: `node-pty`
- **UI Grid**: `react-grid-layout`
- **Icons**: `lucide-react`

## Development

```bash
# Install dependencies (may require node-gyp for native node-pty compilation)
npm install

# Start the development server with HMR
npm run dev

# Package the application for macOS (.dmg / .app)
npm run build:mac
```
