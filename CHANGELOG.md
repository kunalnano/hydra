# Changelog

Entries are ordered newest first. `Unreleased` covers mainline work after the latest tagged release, and tagged dates are written in America/Chicago local time.

## Unreleased (targeting v5.0.0)

### Agent Registry
- Added permanent historical record of 21+ agents with impact scoring, lineage tracking, stack info, key outputs, and lessons learned
- New **Registry** page (8th navigation page) with ranked list, detail view, status filters, and summary stats
- Full CRUD via IPC: getAgentRegistry, getAgentById, updateAgentEntry, getTopAgents
- Data persists to `~/.config/helm/agent-registry.json` with first-run seeding from bundled defaults

### Sentinel Watcher
- Background daemon polling system state every 30s with 7 configurable rules: agent-crash, high-cpu, high-memory, port-conflict, vault-rag-down, lm-studio-idle, long-running-agent
- Notification channels: macOS native notifications, Obsidian vault log (`~/Documents/ai/obsidian-vault/sentinel/`), Slack webhook (configurable)
- Per-rule cooldowns to prevent alert fatigue
- Sentinel status indicator in HELM header (green/amber/red dot)

### Docs
- Rewrote README to lead with value prop, surface intelligence layer, and include project stats
- Rewrote Operator Walkthrough for v4+ page structure with Registry and Sentinel coverage
- Updated Journey So Far through Phase Seven (registry and sentinel)

### Tests
- 235 tests across 25 suites (up from 214/23)
- 6 registry data validation tests
- 13 sentinel rule unit tests

## v4.0.2 — 2026-03-22

### OOTB Setup
- Removed startup assumptions that depended on the caller's working directory
- Resolved bundled runtime assets from the current clone or packaged resources instead of hardcoded repo layouts
- Replaced the default Fleet scan root with the current clone when HYDRA is launched from the repo root
- Added a documented `.env.example` with optional overrides for LM Studio, repo scanning, agent feeds, logs, Sentinel, HIVE, and optional ElevenLabs voice settings

### Reliability
- Made Sentinel vault logging, LuLu parser lookup, Yennefer voice config, and Staff scan report output configurable instead of assuming one machine layout
- Added packaged-resource shipping for registry seed data, Sentinel config, HIVE role prompts, and the LuLu parser helper

### Docs
- Added an LLM-friendly setup prompt at `docs/llm-setup-prompt.md`
- Reordered the README so quick start comes before shell walkthrough details
- Added release collateral for the OOTB setup patch

## v4.0.1 — 2026-03-21

### FM Radio
- Replaced the hardcoded radio home endpoint with a first-run setup popup and persisted user-configured home location
- Updated the signal globe and route readout to handle an unset home endpoint gracefully instead of assuming a built-in city

### Docs
- Updated release collateral to reflect the `v4.0.1` patch tag and the new configurable radio-home flow

## v4.0.0 — 2026-03-21

### Product
- Renamed Hydra to HELM across app identity, config surfaces, and the visible shell language
- Collapsed the shell into seven owned pages so `Bridge`, `Fleet`, `Swarm`, `Grid`, `AI`, `Radio`, and `Logs` stop repeating the same story
- Added the `Phantom` skin alongside the existing `Deck`, `Orbiter`, and `Forge` themes

### Operations
- Added Swarm drill-down so agent rows open into PID, command, ports, goals, and timeline context
- Rebuilt Grid around a live traffic-topology canvas with scoped `loopback`, `LAN`, and `internet` peers
- Replaced filler header trivia with local AI ticker updates for agents, skills, and operator activity

### Persistence
- Moved the shell toward true continuity with persisted snapshots, alerts, briefings, notifications, timeline events, and log history
- Tightened startup hydration so persisted state shows up in the UI instead of feeling fresh every launch

### FM Radio
- Restored the signal globe as a real station-to-home route, now rendered from actual world land geometry instead of placeholder continent blobs
- Fixed the home receiving point to Bulverde, Texas for a stable route anchor

### Docs
- Refreshed the README with current 4.0 captures for AI control, the signal map, and the traffic grid
- Added dedicated release notes for `v4.0.0` and pointed release automation at tag-specific notes

## v3.1.0 — 2026-03-18

### Shell
- Reworked Hydra into a tighter machine-chrome shell with clearer hierarchy across header, nav, scorecards, panels, and the command palette
- Expanded the skin system to `Deck`, `Orbiter`, and `Forge`, with persisted shell-wide theming instead of isolated treatment changes
- Tightened the AI page presentation so the visualizer and action tray read like one instrument instead of a pile of neighboring widgets

### FM Radio
- Added a dedicated `FM Radio` page with a Winamp-style stereo relay layout, presets, search, transport controls, manual stream loading, and local MP3 import
- Added a main-process localhost radio relay so remote streams, manual URLs, and local files play through a stable Electron media path
- Added native audio-file picking, persisted local-library entries, and a singleton audio engine so playback survives navigation

### Reliability
- Allowed loopback media in the renderer CSP and tightened window startup so the FM deck and shell surface appear reliably on launch
- Fixed Electron launch visibility and autoplay-policy issues that were blocking radio playback and, in some cases, leaving Hydra visually absent on startup

### License
- Starting with `v3.0.0`, Hydra ships under PolyForm Noncommercial 1.0.0 instead of MIT
- Earlier releases through `v2.1.2` remain available under the terms they were originally distributed under

## v3.0.0 — 2026-03-18

### Product
- Recast the Hydra shell around a full chrome system so header, nav, scorecards, panels, insight cards, and the command palette all share the same retro-futurist control-room surface
- Added persisted `Deck` and `Orbiter` skins, with `Orbiter` becoming the tighter default shell for new sessions
- Added the new `FM Radio` page with preset station search, tuner controls, loading/error states, and support for custom stream URLs

### Release
- Starting with `v3.0.0`, Hydra ships under PolyForm Noncommercial 1.0.0 instead of MIT
- Earlier releases through `v2.1.2` remain available under the terms they were originally distributed under

## v2.1.2 — 2026-03-15

### Product
- Re-contained the Live Lattice AI sphere inside a responsive `2:1` frame so the globe scales with the AI page instead of overflowing into neighboring panels
- Refocused the AI page around the LM Studio surface instead of duplicating `Notifications`, `Agents`, `Timeline`, and `Command Center` inside the same view

### Reliability
- Fixed the Agents sidebar badge so it reflects the detected roster instead of only showing queued agents
- Tightened agent detection to ignore Codex helper processes, `codex-cli-mcp-tool`, and macOS `CursorUIViewService` false positives

### Operations
- Fixed GitHub Actions CI on Node 20 by rebuilding `better-sqlite3` for the Node runtime before Vitest runs

### Docs
- Updated the README to reflect the shipped Live Lattice patch line and current release state
- Added an operator walkthrough covering pages, actions, shortcuts, and the current local-AI workflow

## v2.1.1 — 2026-03-15

### Reliability
- Fixed agent detection so Codex helper processes and `CursorUIViewService` no longer inflate the agent roster
- Simplified the Agents sidebar badge so it shows the actual detected agent count instead of the old waiting-only value

### Operations
- Fixed GitHub Actions CI on Node 20 by rebuilding `better-sqlite3` for the Node runtime before running Vitest

### Docs
- Updated the README so the documented release state matches the shipped v2.1.1 patch line

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
