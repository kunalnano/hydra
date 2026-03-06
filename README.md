# HYDRA — Real-Time Ops Dashboard

Real-time ops dashboard for developers running AI agents and local services. Electron app for macOS.

Monitors processes, AI agents, git repos, network traffic, disk/battery health, and security posture — with local AI briefings via LM Studio and an auto-heal engine.

## Panels

HYDRA's dashboard has 12 integrated panels:

| Panel | What it does |
|-------|-------------|
| **Command Center** | Workspace health overview with scored process groups |
| **Scorecards Strip** | At-a-glance cards: CPU, Memory, Network, Agents, Ports, Git, Disk, Battery, CC Cost |
| **Git Status** | Multi-repo branch tracking, dirty state, ahead/behind, git actions |
| **Agents** | Auto-detection of 8 AI agent types (Claude Code, Codex, Gemini, Cursor, Aider, Continue, Copilot) |
| **Network** | Per-process bandwidth monitoring with rate computation via `nettop` |
| **Staff of Gandalf** | Security scan integration (survey, illuminate, shadowfax, delve, scry) |
| **Ports** | Listening port detection and port-to-process mapping via `lsof` |
| **Notifications** | Auto-heal events, alerts, severity grouping with dismiss |
| **Local AI (LM Studio)** | On-demand system briefings from a local LLM (Cmd+B) |
| **CC Usage** | Claude Code usage stats — tokens, sessions, cost estimates from `~/.claude/stats-cache.json` |
| **Git History** | Commit timeline across repos with AI-authored commit detection |
| **Timeline** | Workspace lifecycle events (process start/stop) |
| **Logs** | Live log file streaming |

## Key Features

- **Local AI briefings** — LM Studio integration at configurable URL (default `http://localhost:1234`). No cloud API needed. Structured JSON briefings with alerts and suggestions.
- **Auto-heal engine** — 5 built-in rules with 60s cooldowns: high CPU/memory, process/port disappearance, agent idle detection, RAM climb rate, disk/battery warnings.
- **Claude Code usage tracking** — Reads `~/.claude/stats-cache.json` for per-model token counts, cost estimates (Opus/Sonnet/Haiku pricing), daily activity sparklines.
- **System tray** — Color-coded health indicator (green/yellow/red) in the menu bar.
- **SQLite persistence** — Snapshots, alerts, briefings, notifications stored locally.
- **Late-night awareness** — Suppresses non-critical alerts between midnight and 6am.

## Stack

Electron 35 · React 18 · TypeScript · Tailwind 4 · Zustand · SQLite (better-sqlite3) · Vite (electron-vite) · Vitest

## Getting Started

```bash
git clone https://github.com/kunalnano/hydra.git
cd hydra
npm install
npm run dev
```

Requires Node.js 18+.

For a global `hydra` command, put a launcher script in your PATH:

```bash
#!/bin/bash
cd /path/to/hydra && npm run dev &>/dev/null & disown
echo "HYDRA launched."
```

## Configuration

Config file: `~/.config/hydra/config.json`

| Option | Default | Description |
|--------|---------|-------------|
| `lmStudioUrl` | `http://localhost:1234` | LM Studio server URL for AI briefings |
| `gitRepoPaths` | `[]` | Paths to monitor for git status |
| `monitorInterval` | `2000` | Monitor polling interval (ms) |
| `staffBinPath` | auto-detected | Path to `staff` binary for security scans |

No API keys required — AI briefings use a local LM Studio server. If `lmStudioUrl` is wrong or the server moves to a different IP, briefings will fail silently with "LM Studio offline." Update the config file or check `http://<your-ip>:1234/v1/models` to verify.

## Local Configuration

Override defaults with a `.env` file (gitignored, never committed):

```bash
cp .env.example .env
# Edit .env with your values:
LM_STUDIO_URL=http://192.168.1.100:1234
```

The `.env` file sets `LM_STUDIO_URL` for the AI briefing engine. The default (`http://localhost:1234`) works when LM Studio runs on the same machine. If your LM Studio server is on another host, set the URL in `.env`.

The active URL is shown in the briefing panel (below the Request Briefing button) so you can verify the connection target at a glance.

## Testing

```bash
npx vitest --run     # 162 tests
npx vitest --watch   # watch mode
```

Tests cover all monitor parsers (empty output, malformed data, header-only), auto-heal rules, briefing response parsing (including markdown fence stripping), cost estimation, and health scoring.

## Platform Support

- **macOS** — Full support. All monitors functional.
- **Linux/Windows** — Platform guards in place, monitors return empty data. Contributions welcome.

## License

[MIT](LICENSE)
