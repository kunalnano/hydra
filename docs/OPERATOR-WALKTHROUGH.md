# HELM Operator Walkthrough

HELM is a page-based desktop shell for watching local AI systems, repo drift, agents, and machine posture. Each domain gets its own page instead of cramming everything into one dense dashboard. This guide covers the current mainline shell (v4+).

## Shell Layout

A few things stay visible no matter which page you're on:

- **Header** shows the HELM version badge, system health dot (green/amber/red), the Sentinel status indicator, Secure View toggle, skin selector, and manual Refresh.
- **Scorecards strip** keeps machine posture at a glance: CPU, memory, network, agents, ports, dirty repos, disk, battery, and Claude Code cost.
- **Side navigation** is the real contract of the app. If a page has a destination in the nav, its panels live only on that page.
- **Skins** (Deck, Orbiter, Forge, Phantom) swap the entire visual identity without breaking shared chrome.
- **Secure View** redacts local endpoints, hosts, and filesystem paths for safe screenshots and demos.

## Pages

### Bridge

Mission control. Start here for the fastest read on system state.

- **Command Center** shows top-pressure process groups sorted by resource usage. Full workspace control lives in Fleet.
- **Operator Briefing** (compact) gives a one-glance AI-generated situation report.
- **Notifications** surfaces auto-heal events and system alerts.

### Fleet

Workspace ops. Repo drift, process orchestration, and git history.

- **Workspace Control** shows process groups sorted by workspace, health, CPU, or memory.
- **Git Status** tracks branch state, dirty files, and remote drift across all monitored repos. Actions: Stash, Fetch, Pull, Copy Path.
- **Git History** shows commit log with AI-author detection (Claude, Codex, Gemini, etc.).

### Swarm

Agent ops. The live roster, not a vague badge count.

- **Agent Roster** detects running AI agents (Claude Code, Codex, Gemini, Cursor, Aider, Continue, Copilot) with status, workspace context, uptime, goals, and process handles.
- **Swarm Timeline** shows session events: agent starts, stops, actions, errors.

### Grid

Infrastructure posture. Network, security, and ports.

- **Network Traffic** shows per-process bandwidth with rates (macOS nettop).
- **Security Posture** integrates Staff of Gandalf for multi-category security scans with grade scoring.
- **Listening Ports** maps every open port to its owning process.

### AI

The local-model intelligence loop.

- **AI Control** provides full briefing interface with LM Studio endpoint status, Yennefer invocation, and lens control (adaptive/throughput/creative/strict).
- **Invoke Repair** probes local, configured, and LAN-discovered LM Studio endpoints and persists the first healthy one.
- **Spend and Usage** tracks Claude Code sessions, messages, tokens, cost, and model breakdown.

### Registry

The Hall of Fame. Permanent historical record of every agent, tool, and project ever built.

- **Ranked list** sorted by impact score with type icons, status badges, and era ranges.
- **Detail view** shows stack, key outputs, lessons learned, repo links, deployment targets, and lineage (which agents evolved from which).
- **Filters** by status: active, stalled, dead, evolved, retired.
- Data persists to `~/.config/helm/agent-registry.json`.

### Radio

FM streaming tuner. Mood and music inside HELM.

- Preset stations, search, play/pause, volume, and connection state.
- Direct stream URL loading and local MP3 import.
- Signal globe visualization.
- Main-process relay so playback survives the Electron renderer's fragile stream path.

### Logs

Raw event stream. History instead of current posture.

- Live log tailing from configured file paths.
- No operational controls here. Just the stream.

## Sentinel

Sentinel is a background watcher daemon running in the main Electron process. It polls system state every 30 seconds and fires alerts when rules trigger.

**Built-in rules:**
- Agent crash (PID disappears unexpectedly)
- Sustained high CPU (>90% for 2+ polls)
- Memory pressure (>85%)
- Port conflicts (multiple processes on same port)
- vault-rag down (port 8742 not listening)
- LM Studio idle (running but no inference)
- Long-running agent (Claude Code session > 2 hours)

**Notification channels:**
- macOS native notifications (always on)
- Obsidian vault log at `~/Documents/ai/obsidian-vault/sentinel/YYYY-MM-DD.md`
- Slack webhook (configurable)

The Sentinel status chip in the header shows green (nominal), amber (info alerts), or red (warning/critical).

## Core Actions

### Refresh

Click Refresh in the header or use the tray menu's Refresh Now. Forces a new monitor pass.

### Command Palette

`Cmd/Ctrl+K` opens the command palette. Surface quick actions like killing a port or navigating to a page.

### Briefing and Yennefer

- `Cmd/Ctrl+B` requests a local AI briefing.
- `Cmd/Ctrl+Y` invokes Yennefer directly.
- Yennefer lens controls tone: adaptive, throughput, creative, strict.

### LM Studio Repair

Invoke Repair probes the configured endpoint and local/LAN fallbacks. When it finds a healthy LM Studio server, it persists the repaired URL. For remote GPU hosts, LM Studio needs network serving enabled and the firewall open.

## Persistence

HELM keeps local state:

- SQLite stores snapshots, alerts, briefings, notifications, posture history, timeline events, and session records.
- Config at `~/.config/helm/config.json`.
- Agent registry at `~/.config/helm/agent-registry.json`.
- Sentinel config at `src/main/sentinel/config.json` (bundled defaults).
- `.env` for local development overrides.

## Recommended Flow

1. Start on **Bridge**. Read the scorecards and briefing.
2. Follow the signal to the right page: Fleet for repo drift, Swarm for agent issues, Grid for network problems, AI for model control.
3. Use page-local actions instead of trying to solve everything from the top layer.
4. Come back to Bridge when you want posture again instead of detail.
5. Check **Registry** when you want the long view on what you've built.

The side nav is not decorative. It's how HELM avoids turning into a panel graveyard.
