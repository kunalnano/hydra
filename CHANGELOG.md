# Changelog

## v2.1.2 — 2026-03-15

### Product
- Re-contained the Live Lattice AI sphere inside a responsive `2:1` frame so the globe scales with the AI page instead of overflowing into neighboring panels
- Rebalanced the AI page panel sizing so `Notifications`, `Agents`, `Timeline`, and `Command Center` stay visible without the old greedy-height behavior

### Reliability
- Fixed the Agents sidebar badge so it reflects the detected roster instead of only showing queued agents
- Tightened agent detection to ignore Codex helper processes, `codex-cli-mcp-tool`, and macOS `CursorUIViewService` false positives

### Operations
- Fixed GitHub Actions CI on Node 20 by rebuilding `better-sqlite3` for the Node runtime before Vitest runs

### Docs
- Updated the README to reflect the shipped Live Lattice patch line and current release state

## v2.1.0 — 2026-03-15

### Product
- Added the interactive Hydra AI core with a contained lattice visualization, globe sweep, mono/color controls, and the preserved `Ever-Seeing Eye` concept note for future variants
- Expanded the Workspaces page into a real action surface with command-center sort controls, repo triage filters, bulk git actions, and dashboard shortcuts into the pages that need attention

### Intelligence
- Made Claude Code usage much more reactive by overlaying stale cache data with fresh session-log totals and exposing a `Refresh Live` action in the UI
- Improved agent awareness so Codex desktop and Claude CLI sessions are detected more reliably, and clarified CPU usage as per-core consumption instead of pretending `144%` is black magic

### Operations
- Added a GitHub Actions `CI` workflow that runs Vitest on pushes and pull requests to `main`
- Updated scorecards and overview summaries so total agents, engaged agents, repo drift, and CC spend route into the right operational views

### Tests
- Added coverage for live Claude usage aggregation and the expanded agent-detection process matching paths

## v2.0.0 — 2026-03-15

### Product
- Rebuilt Hydra around dedicated pages for `Overview`, `Workspaces`, `Agents`, `Systems`, `AI`, and `Activity` instead of a single dense dashboard
- Added a persistent navigation shell with global status, health scorecards, and faster drill-down between operational views

### AI
- Added `Yennefer Lens` modes (`adaptive`, `creative`, `strict`) so operator tone can match the session
- Reduced repetitive Yennefer critiques by incorporating recent briefing history and multi-agent-aware workload context
- Persisted Yennefer responses into briefing history so later prompts can avoid re-adjudicating the same state

### Reliability
- Preserved the LM Studio self-heal flow, including LAN repair support for remote Windows GPU hosts running LM Studio
- Improved renderer efficiency by mounting only the active page and allowing scorecards to wrap instead of compressing into a single strip

### Docs
- Refreshed the README for the v2 shell and added current screenshots for the `Overview` and `AI` pages

## v1.1.1 — 2026-03-15

### Reliability
- Added ARP-neighbor LM Studio discovery so `Invoke Repair` can recover when the LM Studio host is another machine on the LAN
- Improved unreachable diagnostics for remote LM Studio hosts, including explicit guidance for enabling network serving and firewall access

### Tests
- Added coverage for ARP-based remote endpoint repair and ARP neighbor parsing

## v1.1.0 — 2026-03-15

### Features
- LM Studio endpoint discovery and automatic failover across configured, localhost, and local network addresses
- Manual `Invoke Repair` action in the Local AI panel for one-click LM Studio recovery
- Briefing and Yennefer flows now persist repaired LM Studio endpoints back into Hydra config

### Reliability
- Added the missing `CONFIG_SAVE` IPC handler so renderer-side config writes can actually be persisted
- Improved LM Studio failure messaging to report the checked endpoints instead of a generic fetch failure

### Tests
- Added LM Studio repair-path coverage for stale endpoint recovery, healthy endpoint passthrough, and unreachable endpoint reporting

## v1.0.0 — 2026-03-07

### Features
- File-backed autonomous agent ingestion (`*.state.json`, `*.trace.jsonl`)
- Yennefer voice integration — Cmd+Y invokes Yennefer via LM Studio + ElevenLabs TTS
- Network fallback to `netstat` when `nettop` permission-restricted
- AI briefing engine — on-demand Claude Haiku briefings via Cmd+B
- Auto-heal engine with 5 default rules and 60s cooldowns
- Process monitoring with smart grouping by project/agent/service
- Port monitoring via `lsof` parsing with port-to-process mapping
- AI agent detection for 8 types (Claude, Codex, Gemini, Cursor, Aider, Continue, Copilot)
- Git status tracking — multi-repo scanning with branch, dirty state, ahead/behind
- Network bandwidth monitoring via `nettop` with per-process rates (macOS)
- Firewall rule correlation via LuLu plist parsing (macOS)
- Live log file tailing
- Staff of Gandalf security scan integration (config-driven paths)
- Dashboard with 9 panels, 4 SVG chart components, and scorecards strip
- Time-series ring buffer (60 snapshots, ~2min history) with sparklines
- System tray with color-coded health indicator
- SQLite persistence (snapshots, alerts, briefings, notifications)
- XDG-compliant config system (`~/.config/hydra/config.json`)
- Desktop notifications with 30s throttle
- Platform detection with macOS/Linux/Windows guards

### Security
- Electron sandbox hardening
- `openExternal` URL validation
- `.gitignore` audit for sensitive files

### Tests
- 188 tests passing
