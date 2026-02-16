# HYDRA Session 6 — Agent Team Swarm Prompt

> Paste this into Claude Code after launching `./launch-hydra-swarm.sh`
> Use Shift+Tab to enable delegate mode (lead coordinates, doesn't implement)

---

## 4-Agent Variant (Full Team)

```
You are the lead agent for HYDRA Session 6. Read CLAUDE.md first.

HYDRA is at ~4,600 lines with 63 passing tests across 5 sessions. The dashboard works but has productization blockers. This session focuses on hardening: persistence, cross-platform prep, packaging, and polish.

Spin up these teammates:

TEAMMATE 1 — "Persistence Layer"
- Add SQLite via better-sqlite3 for historical data storage
- Create src/main/db/ with schema.ts (tables: snapshots, alerts, briefings) and queries.ts
- Store monitor snapshots every 30s (configurable)
- Store auto-heal events and briefing responses
- Add IPC channel for renderer to query historical data
- Time-series store should hydrate from DB on startup (last 60 snapshots)
- Tests: schema creation, insert/query, ring buffer hydration

TEAMMATE 2 — "Cross-Platform + Config"
- Replace hardcoded paths in security.ts (/Users/alsharma/...)
- Create src/main/config.ts — XDG-compliant config file (~/.config/hydra/config.json)
- First-run detection: if no config, prompt for API key and git repo paths
- Abstract platform-specific commands in monitors (nettop → cross-platform fallback)
- Add platform detection utility (process.platform checks with typed returns)
- Guard LuLu-specific code behind macOS checks
- Tests: config read/write, platform detection, path resolution

TEAMMATE 3 — "Packaging + Polish"
- Fix README.md with real project description, screenshots section, install instructions
- Configure electron-builder.yml for .dmg (macOS) and .AppImage (Linux)
- Add app icon variants (build/ already has icon.icns/ico/png)
- Implement auto-updater stub (electron-updater, check GitHub releases)
- Clean up electron-vite boilerplate remnants
- Add LICENSE file (MIT)
- Verify npm run build produces working binary

TEAMMATE 4 — "Agent Detection + Notifications Upgrade"
- Refactor agents.ts: move from substring matching to structured detection
- Add agent config: known agent patterns in config.json (extensible)
- Enhance Notifications panel: categorize by severity, add dismiss/acknowledge
- Add notification persistence (store in SQLite via Teammate 1's schema)
- Desktop notifications via Electron Notification API for critical alerts
- Tests: agent detection with new patterns, notification lifecycle

Coordinate through shared types.ts — any teammate adding IPC channels or interfaces must update types.ts and preload/index.ts. Run `npx vitest --run` before marking any task complete.
```

---

## 2-Agent Variant (Budget-Friendly)

```
You are the lead agent for HYDRA Session 6. Read CLAUDE.md first.

HYDRA is at ~4,600 lines with 63 passing tests. This session hardens the app for release.

Spin up these teammates:

TEAMMATE 1 — "Backend Hardening"
- Add SQLite persistence layer (better-sqlite3): snapshots, alerts, briefings tables
- Replace hardcoded paths with XDG-compliant config (~/.config/hydra/config.json)
- First-run config detection + API key prompt
- Abstract platform-specific monitor commands behind OS checks
- Refactor agent detection from substring matching to configurable patterns
- Tests for all new code

TEAMMATE 2 — "Frontend + Packaging"
- Fix README.md with real description and install instructions
- Configure electron-builder for .dmg and .AppImage
- Enhance Notifications panel: severity categories, dismiss, desktop alerts
- Time-series store hydrates from SQLite on startup
- Add LICENSE (MIT), clean boilerplate remnants
- Verify npm run build produces working binary

Coordinate through shared types.ts. Run tests before completing tasks.
```
