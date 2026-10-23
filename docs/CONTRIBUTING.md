# Contributing to Nexus

Thank you for your interest in contributing to **Nexus**! Whether you are fixing bugs, improving documentation, or proposing new features for autonomous agent workflows, your contributions are welcome.

---

## 🛠️ Development Setup

### 1. Prerequisites
- **Node.js**: v20 or higher recommended (minimum v18).
- **npm**: v9 or higher.
- **C/C++ Build Environment**: Required for `node-pty` native compilation.
  - **macOS**: `xcode-select --install`
  - **Linux**: `sudo apt install build-essential python3`
  - **Windows**: Visual Studio C++ Build Tools

### 2. Getting the Code
```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/<your-username>/ai-terminal-app.git
cd ai-terminal-app

# Install dependencies (will also trigger electron-builder install-app-deps)
npm install
```

### 3. Running in Development
```bash
npm run dev
```
This starts Electron with Vite hot-reloading for both main, preload, and renderer bundles.

---

## 🧪 Testing & Validation

Before submitting a pull request, ensure your code compiles and passes all checks:

```bash
# Run TypeScript typechecks across node and web targets
npm run typecheck

# Run linter
npm run lint

# Build production bundles
npm run build
```

---

## 📐 Coding & Architectural Guidelines

1. **Strict Context Isolation**:
   - Never enable `nodeIntegration` in renderer windows.
   - All IPC communication must be routed through the typed facade in `src/preload/index.ts` and `src/preload/index.d.ts`.
2. **Resource Sanitation**:
   - Terminal instances must always clean up their associated `node-pty` child processes when unmounted.
   - Socket files must be released gracefully.
3. **No External Telemetry**:
   - Do not introduce analytics, phone-home metrics, or third-party tracking scripts.
4. **Git Commit Conventions**:
   - Follow standard Conventional Commits:
     - `feat: Add dynamic terminal font scaling`
     - `fix: Correct row height computation for grid gaps`
     - `docs: Update architecture and API guides`

---

## 🚀 Submitting a Pull Request

1. Create a feature branch: `git checkout -b feature/my-cool-feature`
2. Commit your changes: `git commit -m 'feat: Add my cool feature'`
3. Push to your branch: `git push origin feature/my-cool-feature`
4. Open a Pull Request on GitHub against `master`.

---

## 👤 Community & Maintainer

Maintained with ❤️ by **Loknath Surabhi** ([@Lokknath](https://github.com/Lokknath)).
For questions or security disclosures, reach out to `slokknath@gmail.com`.
