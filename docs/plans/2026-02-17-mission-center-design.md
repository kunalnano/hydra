# Hydra Mission Center — Design Document

**Date:** 2026-02-17
**Status:** Approved
**Scope:** Full codebase — new panels, IPC channels, DB tables, action handlers

## Vision

Transform Hydra from a read-only monitoring dashboard into a true laptop mission control. Three layers:

1. **Command Center View** — unified workspace-centric panel with action controls
2. **Session Persistence** — "where was I?" awareness after reboots/sleep
3. **Smart Operations** — health scoring, command palette, enriched briefings

## Layer 1: Command Center View

### Unified Panel (`CommandCenter.tsx`)

Replaces Workspaces as the default landing panel. Each row is a workspace (process group) showing:

- Name + type badge (PRJ / SVC / AI / SYS)
- Ports it owns (`:3000 :5432`)
- CPU/mem bars
- Network in/out rates
- Git branch + dirty indicator
- Health dot (green/yellow/red)
- Action buttons: Kill All, Freeze, Thaw

Click to expand — shows individual processes with per-process actions (Kill, Freeze, Thaw) plus their ports, network connections, and firewall status.

Existing Workspaces panel stays for backward compatibility.

### Action Layer (IPC)

New IPC channels in main process:

| Channel              | Behavior                                           |
| -------------------- | -------------------------------------------------- |
| `process:kill`       | SIGTERM to PID, optional SIGKILL fallback after 5s |
| `process:signal`     | SIGSTOP (freeze) or SIGCONT (thaw) to PID          |
| `process:kill-group` | Kill all PIDs in a workspace group                 |

**Safety guardrails:**

- **PID validation** — before any signal, verify PID still exists and matches expected process name (prevents PID recycling bugs)
- **Protected processes** — hardcoded deny-list: Finder, WindowServer, loginwindow, kernel_task, Hydra itself. Can never be killed/frozen.
- **Group confirmation** — killing a single process is instant. Killing an entire group requires renderer-side confirmation dialog: "Kill 7 processes in next-app? (ports :3000, :3001 will close)"
- **No restart** — Hydra doesn't know how processes were started (npm? docker? systemd?). Kill is honest. Restart is a lie.

**Freeze/Thaw (SIGSTOP/SIGCONT):**

The killer feature. SIGSTOP suspends a process — zero CPU, keeps memory and state, port stays "reserved." SIGCONT wakes it instantly. 80% of the time this is what you want instead of killing.

Frozen processes get a blue snowflake indicator in the Command Center.

## Layer 2: Session Persistence

### Workspace Snapshots

Every 5 minutes, save a structured session snapshot (not raw SystemState):

- Active workspace groups
- Ports owned by each
- Git branches checked out
- Frozen vs running state

New `sessions` DB table. On app launch, compare last session vs current state. Show **Session Delta** banner: "3 workspaces from your last session aren't running: next-app (:3000), postgres (:5432), redis (:6379)".

Not auto-restart — awareness only.

### Activity Timeline

New `Timeline.tsx` panel (or tab inside Command Center). Scrollable event log:

- "3:42pm — next-app started on :3000"
- "3:45pm — Claude agent spawned in /projects/hydra"
- "4:12pm — postgres frozen by user"
- "4:30pm — high CPU alert on webpack"

Events sourced from:

- Process appear/disappear diffs between monitor cycles
- User actions (kill/freeze/thaw)
- Auto-heal events (already exist)

New `timeline_events` DB table. 7-day retention, auto-pruned.

**What this is NOT:**

- Not a process launcher
- Not a session restorer
- Value is awareness — glance at Hydra after a reboot and know what needs attention

## Layer 3: Smart Operations

### Health Scoring

Pure function: workspace group + timeseries history → green/yellow/red.

| Condition                                | Score  |
| ---------------------------------------- | ------ |
| CPU > 80% sustained 30s                  | Yellow |
| CPU > 95% sustained 60s                  | Red    |
| Memory > 70% system total                | Yellow |
| Memory > 85% system total                | Red    |
| Git dirty + ahead > 10 commits           | Yellow |
| Frozen > 1 hour                          | Yellow |
| Port conflict (two workspaces same port) | Red    |

Worst-scoring workspace floats to top. Health dot on every Command Center row.

### Command Palette (`Cmd+K`)

`CommandPalette.tsx` — modal overlay with fuzzy text input. ~10 hardcoded commands:

- "Kill port 3000" — find owning process, confirm, kill
- "Freeze all except postgres" — bulk freeze with exclusion
- "What's using the most CPU?" — sort and highlight
- "Show me what changed since lunch" — filter timeline

String matching with aliases. Not AI-powered — fast, predictable, offline.

### Enriched Briefings

Existing Claude briefing (Cmd+B) gets richer context: workspace health scores, frozen processes, session deltas, recent timeline events. Better situational awareness in AI-generated summaries.

## Implementation

### Pieces

| #   | Piece                          | Scope                                            | Est. Lines |
| --- | ------------------------------ | ------------------------------------------------ | ---------- |
| 1   | Action handlers (main process) | New IPC channels, PID validation, protected list | ~150       |
| 2   | Command Center panel           | Unified table, expandable rows, action buttons   | ~400       |
| 3   | Command Palette                | Cmd+K modal, fuzzy match, ~10 commands           | ~200       |
| 4   | Session persistence            | DB tables, snapshot logic, session delta         | ~200       |
| 5   | Timeline panel                 | Scrollable event log, DB reads                   | ~150       |
| 6   | Health scoring                 | Pure scoring function, briefing enrichment       | ~100       |

**Total: ~1,200 lines new code**

### Sequencing

| Phase | What                            | Why this order                                 |
| ----- | ------------------------------- | ---------------------------------------------- |
| 1     | Action layer (kill/freeze/thaw) | Unblocks everything — first "write" capability |
| 2     | Command Center panel            | Main UI payoff, consumes action layer          |
| 3     | Health scoring                  | Lights up Command Center rows                  |
| 4     | Session persistence + Timeline  | Memory layer, new DB tables                    |
| 5     | Command Palette                 | Power-user cherry on top                       |

Each phase is independently shippable and testable.

### What We're NOT Building

- No process restart (YAGNI)
- No AI-powered command palette
- No session auto-restore
- No new external dependencies

### Files Touched

**New files:**

- `src/renderer/src/panels/CommandCenter.tsx`
- `src/renderer/src/panels/Timeline.tsx`
- `src/renderer/src/panels/CommandPalette.tsx`
- `src/main/actions.ts` (process kill/signal handlers)
- `src/main/sessions.ts` (snapshot/delta logic)
- `src/main/health.ts` (scoring function)

**Modified files:**

- `src/shared/types.ts` — new interfaces + IPC channels
- `src/preload/index.ts` — expose new IPC channels
- `src/main/index.ts` — register new IPC handlers, session snapshot in monitor loop
- `src/main/db/schema.ts` — new tables (sessions, timeline_events)
- `src/main/db/queries.ts` — CRUD for new tables
- `src/renderer/src/App.tsx` — add Command Center + Timeline panels, Cmd+K listener
- `src/renderer/src/stores/system.ts` — action methods (kill, signal, killGroup)
- `src/main/intelligence/briefing.ts` — enriched context with health scores

### Existing Bugs to Fix Along the Way

- `GIT_ACTION` IPC handler exists in git.ts but is never registered in main/index.ts
- Network panel uses local useState instead of system store (inconsistent)
- Agent detection in processes.ts only checks 3 types vs agents.ts checking 8
