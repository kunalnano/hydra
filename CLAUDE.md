# HELM — Operator Shell For Local AI Systems

## What This Is

Electron 28 desktop app for developers monitoring local machines — processes, AI agents, git repos, network, security — with an AI intelligence layer (Claude Haiku briefings, auto-heal engine). "htop meets aircraft carrier CIC meets AI briefing officer."

GitHub: https://github.com/kunalnano/hydra

## Tech Stack

- **Framework:** Electron 28 + React 18 + TypeScript + Tailwind 4
- **State:** Zustand (system store + timeseries ring buffer + UI store)
- **Build:** Vite via electron-vite
- **Persistence:** SQLite via better-sqlite3
- **Tests:** Vitest (189+ tests passing)
- **AI:** Anthropic SDK (Claude Haiku 4.5) for briefings

## Project Structure

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # App lifecycle, tray, IPC handlers, monitor loop
│   ├── monitors/            # System data collectors (run every 2s)
│   │   ├── index.ts         # Monitor orchestrator + snapshot storage
│   │   ├── processes.ts     # ps aux parsing, smart grouping by project/agent/service
│   │   ├── ports.ts         # lsof parsing, port-to-process mapping
│   │   ├── agents.ts        # AI agent detection (8 types: Claude, Codex, Gemini, Cursor, Aider, Continue, Copilot)
│   │   ├── git.ts           # Repo status, branch, ahead/behind tracking
│   │   ├── network.ts       # nettop parsing, per-process bandwidth + rates (macOS-guarded)
│   │   ├── firewall.ts      # LuLu plist parsing, allow/block rules (macOS-guarded)
│   │   └── logs.ts          # Live log file tailing
│   ├── db/                  # SQLite persistence layer
│   │   ├── index.ts         # DB init, WAL mode, lazy connection
│   │   ├── schema.ts        # 4 tables: snapshots, alerts, briefings, notifications
│   │   └── queries.ts       # CRUD for all tables
│   ├── intelligence/        # AI layer
│   │   ├── briefing.ts      # Claude API client, structured prompt builder
│   │   ├── auto-heal.ts     # Rule engine with 60s cooldowns
│   │   ├── rules.ts         # 5 default rules (process/port disappear, high CPU/mem, agent idle)
│   │   └── security.ts      # Staff of Gandalf integration (config-driven paths)
│   ├── config.ts            # XDG-compliant config (~/.config/helm/config.json)
│   ├── platform.ts          # Platform detection (macOS/Linux/Windows)
│   ├── notifications.ts     # Desktop notifications with 30s throttle
│   └── updater.ts           # Auto-updater stub (electron-updater)
├── preload/
│   └── index.ts             # contextBridge IPC contracts (window.helm)
├── renderer/src/
│   ├── App.tsx              # 7-page shell with persistent scorecards
│   ├── main.tsx             # React entry
│   ├── components/          # Reusable SVG visual components
│   │   ├── Scorecard.tsx    # Compact card: big number + trend + sparkline
│   │   ├── Sparkline.tsx    # Pure SVG polyline chart
│   │   ├── GaugeArc.tsx     # Semi-circular gauge (speedometer style)
│   │   └── DonutChart.tsx   # Ring chart with segments
│   ├── panels/              # Dashboard panels (each appears on exactly one page)
│   │   ├── ScorecardsStrip.tsx  # Top row: at-a-glance health cards
│   │   ├── CommandCenter.tsx    # Process overview (Bridge)
│   │   ├── Workspaces.tsx       # Process groups (Fleet)
│   │   ├── GitStatus.tsx        # Branch, dirty state (Fleet)
│   │   ├── GitHistory.tsx       # Commit history (Fleet)
│   │   ├── Agents.tsx           # AI agent status (Swarm)
│   │   ├── Timeline.tsx         # Session timeline (Swarm)
│   │   ├── Network.tsx          # Per-process bandwidth (Grid)
│   │   ├── Security.tsx         # Staff of Gandalf scan UI (Grid)
│   │   ├── Ports.tsx            # Listening ports (Grid)
│   │   ├── Briefing.tsx         # LM Studio briefings (Bridge compact, AI full)
│   │   ├── CCUsage.tsx          # Claude Code usage tracking (AI)
│   │   ├── Notifications.tsx    # Auto-heal events + alerts (Bridge)
│   │   ├── FMRadio.tsx          # FM radio player (Radio)
│   │   └── Logs.tsx             # Live log streaming (Logs)
│   └── stores/
│       ├── system.ts        # Zustand: all monitor data + IPC subscriptions
│       ├── timeseries.ts    # Ring buffer (60 snapshots, ~2min history)
│       ├── navigation.ts    # Current page state
│       ├── skin.ts          # 4 skins: Deck, Orbiter, Forge, Phantom
│       └── privacy.ts       # Secure View toggle
└── shared/
    └── types.ts             # All shared TypeScript interfaces
```

## Pages (v4.0.0 — zero panel duplication)

| Page | ID | Panels |
|------|----|--------|
| Bridge | `bridge` | Command Center, Briefing (compact), Notifications |
| Fleet | `fleet` | Workspaces, Git Status, Git History |
| Swarm | `swarm` | Agents, Timeline |
| Grid | `grid` | Network, Security, Ports |
| AI | `ai` | Briefing (full), CC Usage |
| Radio | `radio` | FM Radio |
| Logs | `logs` | Logs |

## Architecture Rules — READ BEFORE CODING

### IPC Contract

- Main → Renderer communication via typed IPC channels defined in `shared/types.ts`
- Preload bridge in `preload/index.ts` exposes `window.helm` via `contextBridge`
- **NEVER** use `ipcRenderer` directly in renderer code
- All new IPC channels must be added to: types.ts interface, preload bridge, AND main handlers

### Monitor Pattern

- Every monitor in `monitors/` exports a pure function that parses CLI output into typed data
- Monitor orchestrator (`monitors/index.ts`) runs all monitors on a 2s interval
- Monitors MUST handle failures gracefully (return empty arrays, not throw)
- Parser tests cover: empty output, malformed data, header-only input

### Intelligence Layer

- Auto-heal rules have 60s cooldowns per rule+target combo to prevent alert fatigue
- Briefing prompts are built from current system state (not historical)
- Security scans shell out to `staff` CLI — must handle missing binary gracefully
- `ANTHROPIC_API_KEY` env var required for briefings (degrade to "no key" message)

### Renderer Patterns

- All panels are React functional components reading from Zustand stores
- SVG chart components are pure (no external charting library)
- Time-series uses ring buffer pattern: fixed 60-slot array, push new, drop oldest
- 4 skins: Deck (cyan), Orbiter (teal), Forge (gold), Phantom (violet)
- Each panel appears on exactly ONE page (zero duplication)

### State Management

- `system.ts` store: canonical source for ALL monitor data, updated via IPC listeners
- `timeseries.ts` store: derived ring buffers for sparklines/charts
- `navigation.ts` store: current page ID
- **NEVER** put monitor data in component state — always in Zustand

## Dev Commands

```bash
npm install          # Install deps
npm run dev          # Start in dev mode (hot reload)
npm run build        # Build for production
npx vitest --run     # Run all tests
npx vitest --watch   # Watch mode
```

## Testing Conventions

- Test files colocated: `*.test.ts` next to source
- Test edge cases: empty output, malformed data, header-only
- Rate computation tests use two-snapshot pattern
- All parsers are pure functions — no mocking needed

## Agent Team Task Boundaries

Safe to parallelize:

- **Panels** are independent — each panel can be modified without affecting others
- **Monitors** are independent — each parser is a pure function
- **SVG components** are independent — pure props-in, SVG-out

Requires coordination:

- **shared/types.ts** — single source of truth for all interfaces
- **main/index.ts** — IPC handler registration, tray setup, monitor loop, DB init
- **preload/index.ts** — must mirror types.ts IPC channels exactly
- **stores/system.ts** — all panels read from this, changes affect everything
- **main/config.ts** — config changes affect security.ts, agents.ts, db/index.ts
- **main/db/** — persistence layer used by monitors, intelligence, and notifications
