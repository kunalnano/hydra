# HELM Operator Walkthrough

HELM is a page-based desktop shell for watching local AI systems, repo drift, agents, and machine posture without collapsing all of it into one screaming dashboard. This guide covers the current 4.0 shell, and the latest tagged release is `v4.0.1`.

## Shell Layout

HELM keeps a few things visible no matter which page you are on:

- The top header carries the operator wire, `Secure View`, skin selection, and a manual `Refresh` action.
- The scorecards strip keeps machine posture visible without forcing every tab to duplicate CPU, memory, network, agents, ports, repos, disk, and battery summaries.
- The left navigation rail is the page contract of the app. If a surface has its own page, it should not also be squatting somewhere else.
- The shell skin selector lets you swap between `Deck`, `Orbiter`, `Forge`, and `Phantom` without breaking the shared chrome language.
- `Secure View` is the demo-safe switch. It redacts local endpoints, peer IPs, and filesystem paths across visible operator surfaces.
- The header also carries the Sentinel status chip on current mainline builds, so alert pressure stays visible even when you are off the Logs page.

## Pages

### Bridge

Use `Bridge` when you want the fastest read on what changed and where to drill next.

- Keeps attention on posture, hotspots, notifications, and the compact briefing layer.
- It is overview-only by design.

### Fleet

Use `Fleet` for repos, workspace drift, and process orchestration.

- `Git Status` turns dirty repos and remote drift into actions like `Stash`, `Fetch`, and `Pull`.
- `Command Center` stays the operational view for sorting and triaging live workspaces.

### Swarm

Use `Swarm` when you want the real agent roster instead of a vague badge.

- Tracks detected agent sessions such as Codex, Claude Code, Cursor, Gemini CLI, and other supported tools.
- Clicking an agent drills into PID, command, workspace, ports, and related timeline context.

### Grid

Use `Grid` for infrastructure posture and network visibility.

- The traffic grid turns live connections into scoped `loopback`, `LAN`, and `internet` topology.
- Ports and the security posture live here instead of being repeated elsewhere.

### AI

The local-model intelligence loop.

- The AI page owns LM Studio state, briefings, repair, Yennefer, and usage tracking.
- The page is for operator control, not general system summary.

### Registry

Use `Registry` when you want the long view instead of the live roster.

- It keeps the permanent historical record of built agents, tools, and systems.
- Entries track impact score, lineage, deployment targets, key outputs, and lessons learned.
- Data persists at `~/.config/helm/agent-registry.json`.

### Radio

Use `Radio` when you want the live audio surface.

- Preset stations, local MP3s, manual URLs, and persisted playback state all live in one tuner view.
- The signal map traces station origin back to the operator’s saved home endpoint on a real-world orthographic map.

### Logs

Use `Logs` when you need the raw stream instead of summaries.

- Live log tailing and persisted history live here.
- This page is for “what happened?” rather than “what should I do right now?”

## Sentinel

Sentinel is the background watcher running in the main Electron process. It polls system state on an interval and raises alerts when configured rules trigger.

Built-in coverage on current mainline includes:
- Agent crash detection
- Sustained high CPU
- Memory pressure
- Port conflicts
- LM Studio idle detection
- Long-running agent detection

The Sentinel status chip in the header stays green, amber, or red depending on active alert severity.

## Core Actions

### Refresh

Click Refresh in the header or use the tray menu's Refresh Now. Forces a new monitor pass.

### Command Palette

- `Cmd/Ctrl+K` opens the command palette.
- HELM can surface quick actions such as opening a page, killing a port owner, or acting on a workspace group.

### Briefing and Yennefer

- `Cmd/Ctrl+B` requests a local AI briefing.
- `Cmd/Ctrl+Y` invokes Yennefer directly.
- The `Yennefer Lens` modes stay available for different operational tones:
  - `adaptive`
  - `throughput`
  - `creative`
  - `strict`

### LM Studio Repair

- `Invoke Repair` probes the configured LM Studio endpoint and healthy local or LAN fallbacks.
- When HELM finds a healthy server, it persists the repaired URL back into config.
- For remote Windows GPU hosts, LM Studio still needs network serving enabled and the firewall open on the chosen port.

## Persistence

HELM keeps local state instead of pretending everything is ephemeral:

- SQLite stores snapshots, alerts, briefings, notifications, posture history, timeline events, and log history.
- Config lives at `~/.config/helm/config.json`.
- Agent registry lives at `~/.config/helm/agent-registry.json`.
- `.env` can override local development settings such as `LM_STUDIO_URL`.

## Recommended Flow

If you are using HELM as intended, the normal loop is:

1. Start in `Bridge`.
2. Follow the signal to `Fleet`, `Swarm`, `Grid`, `AI`, `Radio`, or `Logs`.
3. Use the page-local actions instead of trying to solve everything from the top layer.
4. Come back to `Bridge` when you want posture again instead of detail.
5. Use `Registry` when you want the historical archive instead of the live operating picture.

That is the whole point of the shell. The side nav is not decorative. It is how the app avoids turning back into a giant panel graveyard.
