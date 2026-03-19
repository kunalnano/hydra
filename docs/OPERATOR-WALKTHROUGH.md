# HYDRA Operator Walkthrough

Hydra is a page-based desktop shell for watching local AI systems, repo drift, agents, and machine posture without collapsing all of it into one screaming dashboard. This guide covers the current shipped surface in `v3.1.0`.

## Shell Layout

Hydra keeps a few things visible no matter which page you are on:

- The top header shows live CPU, memory, network, and a manual `Refresh` action.
- The scorecards strip keeps machine posture visible: CPU, memory, network, agents, ports, dirty repos, disk, battery, and Claude Code cost.
- The left navigation rail is the main contract of the app. If a page has its own destination in the nav, it should not also be squatting on another page.
- The shell skin selector lets you swap between `Deck`, `Orbiter`, and `Forge` without breaking the shared chrome language.

## Pages

### Overview

Use `Overview` when you want the fastest read on what changed and where to drill in next.

- Shows a calmer summary layer instead of every panel at once.
- Keeps attention on hotspots, active agents, repo drift, and the next useful page to open.

### Workspaces

Use `Workspaces` for repos, process groups, and operational cleanup.

- `Git Status` turns dirty repos and remote drift into actions like `Stash`, `Fetch`, `Pull`, and `Copy Path`.
- `Command Center` can be sorted by workspace, health, CPU, or memory depending on how you want to triage live processes.

### Agents

Use `Agents` when you want the real roster, not a vague badge.

- Tracks detected agent sessions such as Codex, Claude Code, Cursor, and other supported tools.
- Shows status, workspace/context matching, and process handles so you can tell what is active, idle, or waiting.

### Systems

Use `Systems` for supporting infrastructure and machine-adjacent telemetry.

- Network, ports, security posture, and Claude Code usage all live here.
- `CC Usage` supports `Refresh Live` to rescan Claude session logs when cached cost data is stale.

### AI

Use `AI` for the local-model control loop.

- The `Live Lattice` maps `Workspaces`, `Agents`, `Ports`, and `Git` onto the sphere.
- The interface tray below the lattice shows the LM Studio endpoint, lens control, swarm counts, CPU, memory, ports, and current readout.
- The action dock gives you `Request Briefing`, `Invoke Repair`, and `Invoke Yennefer` without leaving the page.

### FM Radio

Use `FM Radio` when you want a live audio surface inside Hydra instead of another dashboard panel.

- Preset stations, search, play/pause, volume, and connection state all live in one tuner view.
- You can also load a direct stream URL manually and Hydra will persist the last station and volume.

### Activity

Use `Activity` when you need history instead of current posture.

- Logs, timeline entries, and git history live here.
- This page is for “what happened?” rather than “what should I do right now?”

## Core Actions

### Refresh

- Click `Refresh` in the top-right header to force a new monitor pass.
- The tray menu also exposes `Refresh Now`.

### Command Palette

- `Cmd/Ctrl+K` opens the command palette.
- Hydra can surface quick actions such as killing a listening port or freezing/thawing a workspace process group.

### Briefing And Yennefer

- `Cmd/Ctrl+B` requests a Local AI briefing.
- `Cmd/Ctrl+Y` invokes Yennefer directly.
- The `Yennefer Lens` controls tone:
  - `adaptive` for balanced judgment
  - `throughput` for dense multi-agent sessions
  - `creative` for looser synthesis
  - `strict` for harsher operational scrutiny

### LM Studio Repair

- `Invoke Repair` probes the configured LM Studio endpoint and local/LAN fallbacks.
- When Hydra finds a healthy server, it persists the repaired URL back into config.
- For remote Windows GPU hosts, LM Studio still needs network serving enabled and the firewall open on the chosen port.

## Persistence And Config

Hydra keeps local state instead of pretending everything is ephemeral:

- SQLite stores snapshots, alerts, briefings, notifications, posture history, and timeline events.
- Config lives at `~/.config/hydra/config.json`.
- `.env` can override local development settings such as `LM_STUDIO_URL`.

## Recommended Flow

If you are using Hydra as intended, the normal loop is:

1. Start in `Overview`.
2. Follow the signal to `Workspaces`, `Agents`, `Systems`, `AI`, or `FM Radio`.
3. Use the page-local actions instead of trying to solve everything from the top layer.
4. Come back to `Overview` when you want posture again instead of detail.

That is the whole point of the shell. The side nav is not decorative. It is how the app avoids turning back into a giant panel graveyard.
