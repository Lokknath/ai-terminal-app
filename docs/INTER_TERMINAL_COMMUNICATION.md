# Inter-Terminal Communication & SpeakDock

Nexus introduces a native communication and orchestration fabric between concurrent terminal sessions. Rather than treating terminals as isolated silos, Nexus allows developers and agents to pipe outputs, dispatch prompts across sessions, and hand off contextual workflows.

---

## What is SpeakDock?

**SpeakDock** is an interactive floating and dockable communication hub embedded directly into the Nexus workspace.

### Core Capabilities:
1. **Targeted Message Injection**: Send instructions, prompts, or test inputs directly into any terminal’s stdin without manual copy-pasting.
2. **Buffer Piping**: Select any source terminal, grab its last *N* lines of buffer or error trace, and pipe it directly to another terminal.
3. **Multi-Agent Handoffs**: Chain workflows between different AI models.

---

## Practical Scenarios

### Scenario A: Build Failure Handoff (Claude ➔ Gemini)
1. **Terminal 1 (Claude Code)** is running a complex backend migration and hits an unfamiliar compiler bug.
2. Open **SpeakDock**.
3. Select **Source**: `Terminal 1 (Claude Code)`.
4. Select **Target**: `Terminal 2 (Gemini Antigravity)`.
5. Click **"Pipe Last Output with Prompt"**:
   > *"Analyze this compilation error output from Terminal 1 and suggest the fix for our TypeScript types."*
6. SpeakDock streams the error buffer directly into Gemini’s active session.

### Scenario B: Coordinated Full-Stack Swarm
- **Terminal 1**: Frontend Next.js dev server.
- **Terminal 2**: Backend Go microservice.
- **Terminal 3**: Autonomous QA Agent running Cypress tests.
- When the QA agent detects an endpoint failure, SpeakDock can broadcast a restart or targeted payload to both services simultaneously.

---

## Session Identification & Monotonic Numbering

To make inter-terminal addressing effortless:
- Every terminal has a permanent **monotonic session index** (`#1`, `#2`, `#3`) scoped to its folder.
- Custom naming is supported: double-click any terminal tab to rename it (e.g. `API Server`, `Auth Worker`, `DB Migration`).
- SpeakDock dropdowns display both the folder badge, custom name, and session ID for quick selection.
