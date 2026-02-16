# HYDRA — AI-Native Mission Control Dashboard

## What This Is
Electron 28 desktop app for developers monitoring local machines — processes, AI agents, git repos, network, security — with an AI intelligence layer (Claude Haiku briefings, auto-heal engine). "htop meets aircraft carrier CIC meets AI briefing officer."

GitHub: https://github.com/kunalnano/hydra

## Tech Stack
- **Framework:** Electron 28 + React 18 + TypeScript + Tailwind 4
- **State:** Zustand (system store + timeseries ring buffer + UI store)
- **Build:** Vite via electron-vite
- **Tests:** Vitest (63 tests, all passing)
- **AI:** Anthropic SDK (Claude Haiku 4.5) for briefings

## Project Structure
```
src/
├── main/                    # Electron main process
│   ├── index.ts             # App lifecycle, tray, IPC handlers, monitor loop
│   ├── monitors/            # System data collectors (run every 2s)
│   │   ├── index.ts         # Monitor orchestrator
│   │   ├── processes.ts     # ps aux parsing, smart grouping by project/agent/service
│   │   ├── ports.ts         # lsof parsing, port-to-process mapping
│   │   ├── agents.ts        # AI agent detection (Claude Code, Codex, Gemini)
│   │   ├── git.ts           # Repo status, branch, ahead/behind tracking
│   │   ├── network.ts       # nettop parsing, per-process bandwidth + rates
│   │   ├── firewall.ts      # LuLu plist parsing, allow/block rules
│   │   └── logs.ts          # Live log file tailing
│   └── intelligence/        # AI layer
│       ├── briefing.ts      # Claude API client, structured prompt builder
│       ├── auto-heal.ts     # Rule engine with 60s cooldowns
│       ├── rules.ts         # 5 default rules (process/port disappear, high CPU/mem, agent idle)
│       └── security.ts      # Staff of Gandalf integration (survey/illuminate/shadowfax/delve/scry)
├── preload/
│   └── index.ts             # contextBridge IPC contracts
├── renderer/src/
│   ├── App.tsx              # 5-row grid layout with scorecards strip
│   ├── main.tsx             # React entry
│   ├── components/          # Reusable SVG visual components
│   │   ├── Scorecard.tsx    # Compact card: big number + trend + sparkline
│   │   ├── Sparkline.tsx    # Pure SVG polyline chart
│   │   ├── GaugeArc.tsx     # Semi-circular gauge (speedometer style)
│   │   └── DonutChart.tsx   # Ring chart with segments
│   ├── panels/              # Dashboard panels (9 total)
│   │   ├── ScorecardsStrip.tsx  # Top row: 6 at-a-glance health cards
│   │   ├── Workspaces.tsx   # Process groups with expand/collapse
│   │   ├── Agents.tsx       # AI agent status + workspace linking
│   │   ├── Ports.tsx        # Listening ports → process mapping
│   │   ├── GitStatus.tsx    # Branch, dirty state, ahead/behind
│   │   ├── Briefing.tsx     # On-demand Claude briefings (Cmd+B)
│   │   ├── Network.tsx      # Per-process bandwidth + firewall correlation
│   │   ├── Security.tsx     # Staff of Gandalf scan UI
│   │   ├── Notifications.tsx # Auto-heal events + alerts
│   │   └── Logs.tsx         # Live log streaming
│   └── stores/
│       ├── system.ts        # Zustand: all monitor data + IPC subscriptions
│       ├── timeseries.ts    # Ring buffer (60 snapshots, ~2min history)
│       └── ui.ts            # Panel collapse/expand state
└── shared/
    └── types.ts             # All shared TypeScript interfaces
```

## Architecture Rules — READ BEFORE CODING

### IPC Contract
- Main → Renderer communication via typed IPC channels defined in `shared/types.ts`
- Preload bridge in `preload/index.ts` exposes `window.api` via `contextBridge`
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
- Dark theme: `bg-gray-900`, `text-gray-100`, neon accent colors
- Panels support expand/collapse via UI store

### State Management
- `system.ts` store: canonical source for ALL monitor data, updated via IPC listeners
- `timeseries.ts` store: derived ring buffers for sparklines/charts
- `ui.ts` store: transient UI state (collapsed panels, selected tabs)
- **NEVER** put monitor data in component state — always in Zustand

## Completed Systems (5 Sessions)
| System | Status | Key Files |
|--------|--------|-----------|
| Process monitoring | ✅ | processes.ts (smart grouping) |
| Port monitoring | ✅ | ports.ts (lsof parsing) |
| Agent detection | ✅ | agents.ts (Claude/Codex/Gemini) |
| Git status | ✅ | git.ts (multi-repo scanning) |
| Network bandwidth | ✅ | network.ts (nettop + rate computation) |
| Firewall rules | ✅ | firewall.ts (LuLu plist parsing) |
| Log tailing | ✅ | logs.ts (file watcher + streaming) |
| AI Briefing | ✅ | briefing.ts (Claude Haiku, Cmd+B) |
| Auto-heal engine | ✅ | auto-heal.ts + rules.ts (5 rules) |
| Security scans | ✅ | security.ts (Staff of Gandalf) |
| Dashboard UI | ✅ | 9 panels, 4 SVG components |
| Scorecards strip | ✅ | 6 at-a-glance health cards |
| Time-series charts | ✅ | Ring buffer + sparklines |
| System tray | ✅ | Color-coded health indicator |

**Total: ~4,600 lines TypeScript, 63 tests passing**

## What's NOT Done (Productization Blockers)
- [ ] macOS-only (nettop, lsof, LuLu) — no cross-platform
- [ ] Hardcoded paths in security.ts (`/Users/alsharma/...`)
- [ ] README is still electron-vite boilerplate
- [ ] No persistence (SQLite for history/trends)
- [ ] No first-run setup wizard (API key, git repo paths)
- [ ] No .dmg packaging via electron-builder
- [ ] Agent detection is brittle (substring matching)
- [ ] No licensing/auth infrastructure

## Dev Commands
```bash
npm install          # Install deps
npm run dev          # Start in dev mode (hot reload)
npm run build        # Build for production
npx vitest --run     # Run all 63 tests
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
- **main/index.ts** — IPC handler registration, tray setup, monitor loop
- **preload/index.ts** — must mirror types.ts IPC channels exactly
- **stores/system.ts** — all panels read from this, changes affect everything
