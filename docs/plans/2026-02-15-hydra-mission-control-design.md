# HYDRA — Mission Control Design

> **Author:** Hank Sharma | **Date:** 2026-02-15
> **Status:** Approved for MVP implementation

---

## Vision

A single-pane-of-glass mission control center that shows everything happening on your machine — processes, ports, AI agents, git repos, logs — with an LLM intelligence layer that summarizes, alerts, auto-heals, and eventually acts as a chief of staff across your multi-agent workflow.

Think: **htop meets aircraft carrier CIC meets AI briefing officer.**

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ELECTRON APP                          │
│                                                          │
│  ┌─────────────────────────────────┐  ┌──────────────┐ │
│  │     MAIN PROCESS (Node.js)      │  │  SYSTEM TRAY │ │
│  │                                  │  │  Quick glance│ │
│  │  • System monitors (ps, lsof,   │  └──────────────┘ │
│  │    docker, git, netstat)         │                    │
│  │  • Claude API client (Haiku)    │  ┌──────────────┐ │
│  │  • Auto-heal engine             │  │  NATIVE      │ │
│  │  • Suggestion engine            │  │  NOTIFS      │ │
│  │  • WebSocket server (:9800)     │  └──────────────┘ │
│  │    for external adapters        │                    │
│  └────────────┬─────────────────────┘                    │
│               │ IPC                                      │
│  ┌────────────▼─────────────────────┐                    │
│  │     RENDERER (React + Tailwind)  │                    │
│  │                                   │                    │
│  │  Dashboard panels:               │                    │
│  │  • Workspaces / Processes        │                    │
│  │  • AI Agents                     │                    │
│  │  • Ports / Services              │                    │
│  │  • Git Status                    │                    │
│  │  • Live Logs                     │                    │
│  │  • LLM Briefing                  │                    │
│  │  • Command Input                 │                    │
│  └───────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
         ▲ WebSocket (:9800)
         │
   ┌─────┴──────────┐
   │ External        │
   │ Adapters        │
   │ (Claude Code,   │
   │  Codex, etc.)   │
   └─────────────────┘
```

Electron's main process IS the hub. No separate server. The renderer is pure React. External adapters (Claude Code monitor, future Codex adapter) connect via WebSocket.

---

## Intelligence Layer

### Three Functions

1. **Narrative Summarization (on demand)** — Press hotkey, current system state goes to Haiku, returns natural-language briefing.

2. **Anomaly Alerts (continuous, rule-based)** — Process died, port went down, agent waiting too long, git diverged. Most alerts are rule-based; LLM composes the alert message and suggests an action.

3. **Operational Commands (future)** — Natural language commands routed to system actions.

### Autonomy Model

| Tier                              | Behavior                                                               | MVP?   |
| --------------------------------- | ---------------------------------------------------------------------- | ------ |
| **Tier 1: Auto-Heal**             | Restart crashed dev servers, auto-approve safe Claude Code ops         | Yes    |
| **Tier 2: Proactive Suggestions** | "Haven't committed in 2hrs", "Agent idle 15min", "Repo diverged"       | Yes    |
| **Tier 3: Always Escalate**       | Git push/merge, customer-facing, production, killing unknown processes | Future |
| **Tier 4: Orchestration**         | Proactively dispatch tasks to agents based on work patterns            | Future |

### Safety (Semantic Validation)

When routing responses (especially for future agent multiplexing), the LLM validates that the response semantically makes sense for the matched request. No blunt confirmation dialogs — the intelligence catches misroutes.

---

## Data Sources

| Data                 | macOS Source                                                              | Refresh Rate |
| -------------------- | ------------------------------------------------------------------------- | ------------ |
| Processes            | `ps aux` / Node.js `os` module                                            | 2s           |
| Open ports           | `lsof -i -P -n`                                                           | 2s           |
| Port→process mapping | Joined from ps + lsof                                                     | 2s           |
| AI agent detection   | Process name matching (claude, codex) + tmux pane status                  | 2s           |
| Git status           | `git status --porcelain`, `git log --oneline -1`, `git rev-list` per repo | 5s           |
| Live logs            | Tail process stdout via PTY or log files                                  | Streaming    |
| CPU/Memory           | `os.cpus()`, `os.freemem()`                                               | 2s           |

### Smart Grouping

Raw process lists are useless. HYDRA groups by:

- **Project** — cluster processes by working directory
- **Type** — dev server, AI agent, database, service, build tool, other
- **Port mapping** — which process owns which port

Detection patterns for agent recognition:

- `claude` in process name/args → Claude Code
- `codex` in process name/args → Codex
- Known port patterns (e.g., 3000-3999 → likely dev servers)

---

## Tech Stack

| Component         | Choice                                       | Why                                     |
| ----------------- | -------------------------------------------- | --------------------------------------- |
| Shell             | Electron 33+                                 | Latest stable, ESM, native integrations |
| UI                | React 19 + Tailwind 4                        | Fast iteration, component reuse         |
| Build             | Vite + electron-vite                         | Fast HMR, clean main/renderer split     |
| Monitoring        | Node.js `child_process`                      | Spawn ps, lsof, docker, git             |
| LLM               | Claude API (Haiku 4.5)                       | Fast (~1s), cheap (~$0.001/call)        |
| State             | Zustand (renderer) + in-memory (main)        | Simple, no boilerplate                  |
| IPC               | Electron contextBridge + ipcMain/ipcRenderer | Type-safe                               |
| External adapters | ws (WebSocket)                               | Future adapter connections              |
| Charts (future)   | Recharts or custom SVG                       | CPU/memory trends                       |

---

## Directory Structure

```
Alfred/hydra/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── src/
│   ├── main/
│   │   ├── index.ts             # App lifecycle, tray, windows
│   │   ├── monitors/
│   │   │   ├── processes.ts     # ps aux → grouped process data
│   │   │   ├── ports.ts         # lsof → port-to-process mapping
│   │   │   ├── agents.ts        # Detect AI agent processes
│   │   │   ├── git.ts           # Git status across known repos
│   │   │   └── logs.ts          # Tail stdout/log files
│   │   ├── intelligence/
│   │   │   ├── briefing.ts      # Claude API summarization
│   │   │   ├── auto-heal.ts     # Tier 1 rules + restart logic
│   │   │   └── rules.ts         # Auto-resolve/heal rule definitions
│   │   └── ipc.ts               # IPC handlers
│   ├── preload/
│   │   └── index.ts             # contextBridge API
│   └── renderer/
│       ├── index.html
│       ├── App.tsx
│       ├── stores/
│       │   └── system.ts        # Zustand store
│       ├── panels/
│       │   ├── Workspaces.tsx
│       │   ├── Agents.tsx
│       │   ├── Ports.tsx
│       │   ├── GitStatus.tsx
│       │   ├── Logs.tsx
│       │   └── Briefing.tsx
│       ├── components/
│       │   ├── StatusBadge.tsx
│       │   └── Panel.tsx
│       └── styles/
│           └── globals.css
├── resources/
│   └── icon.png
└── config/
    └── rules.yaml
```

---

## MVP Scope ("First Light")

### In Scope

1. Electron shell — window, system tray, quit
2. Process monitor — grouped by project/type
3. Port monitor — open ports mapped to processes
4. Agent detection — recognize Claude Code, Codex
5. Git status — branch, dirty state, ahead/behind for known repos
6. Live logs — select a process, see its output stream
7. LLM briefing — hotkey → Haiku summarizes current state
8. Auto-heal — Node.js dev server crashes → auto-restart + notify

### Out of Scope (Future Iterations)

- Docker monitoring
- Disk I/O
- Network bandwidth charts
- Proactive suggestions (Tier 2) — designed but not in first build
- Voice input/output
- External adapter WebSocket server
- Command input bar
- Charts/trends

---

## Build Plan

### Session 1 — Scaffold + Monitors

- electron-vite project setup (React + TypeScript + Tailwind)
- System monitors: processes, ports, agent detection, git status
- Typed interfaces for all data
- Basic Electron window + tray icon

### Session 2 — Dashboard UI + Live Logs

- React dashboard with CSS Grid panel layout
- Workspaces, Agents, Ports, Git, Logs panels
- Live log tailing (select process → see output)
- IPC wiring: monitors → main process → renderer via Zustand

### Session 3 — Intelligence + Auto-Heal

- Claude API integration (Haiku 4.5)
- Hotkey-triggered briefing
- Auto-heal engine (crash detect → restart → notify)
- Native macOS notifications
- Tray icon status (green/yellow/red)

---

## Future Vision

### Phase 2: Full Observability

- Docker containers, disk I/O, network bandwidth
- Charts and trends (CPU/memory over time)
- Process lifecycle tracking

### Phase 3: Agent Multiplexing (Original HYDRA Spec)

- WebSocket server for external adapters
- Claude Code adapter (tmux + hooks)
- Codex adapter, Gemini adapter
- Cognitive router for agent request summarization + routing
- Voice input (Whisper.cpp) + voice output (TTS)

### Phase 4: Chief of Staff

- Tier 4 orchestration — proactive task dispatch
- Cross-agent context bridging
- Calendar integration + meeting prep
- Work pattern learning

---

## Design Decisions

1. **Electron over terminal UI** — Data density requires real layout. Terminal is too cramped for processes + ports + git + logs + agents + briefing.

2. **Intelligence coupled, not layered** — A dumb aggregator is just tmux. The LLM intelligence IS the product differentiation. No fallback-to-dumb mode.

3. **Semantic safety over confirmation dialogs** — The router validates that responses make sense for requests, rather than adding friction with "are you sure?" prompts.

4. **Auto-heal Tier 1 + suggestions Tier 2** — Autonomous enough to feel alive, constrained enough to be trustworthy.

5. **Ultra-lean MVP** — Prove the concept with processes + ports + agents + git + logs + briefing + one auto-heal rule. Everything else layers on.
