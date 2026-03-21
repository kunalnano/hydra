# HELM: The Journey So Far

HELM did not start as a shell. It started as a dense desktop dashboard for watching processes, ports, agents, git repos, and local AI health without hopping between terminal panes all day. The first useful version proved the monitor stack, but it also proved the limit of the one-big-wall approach.

## Phase One: Make The Machine Visible

The first milestone was operational visibility:

- Process grouping by workspace, service, and agent
- Port inspection and listener mapping
- Git drift across multiple repositories
- Local AI briefings through LM Studio
- Persistence for snapshots, briefings, alerts, and notifications

That version (originally called HYDRA) made the tool useful, but it behaved like a panel graveyard. Everything shouted at once.

## Phase Two: Turn The Dashboard Into A Shell

The next major shift was structural. The project stopped trying to be one overloaded cockpit and turned into a real shell with purpose-built pages. Navigation stopped being decorative. The side rail became the real contract of the app.

This was also when the Winamp-era aesthetic became intentional: hard bevels, brushed metal textures, recessed LED readouts, raised buttons. Not a theme applied on top, but a design language that shaped every component.

## Phase Three: Yennefer Gets A Real Stage

The AI page was pared down and rebuilt around the local-model loop:

- Briefings from Claude Haiku or local models
- Repair actions for LM Studio endpoints
- Yennefer invocation with configurable personality lenses
- Live swarm and machine readout

The visual language changed too. The old globe experiments led to a mech entity with armor, antennas, and reactor motion. That gave the project a clearer identity.

## Phase Four: FM Radio Becomes Real

FM Radio started as a mood-board idea and turned into a proper desktop feature:

- Preset stations, search, play/pause, volume
- Custom direct stream loading and local MP3 import
- A main-process relay so playback survives Electron's fragile renderer stream path
- Signal globe visualization

This was where the project leaned harder into software as a toy as well as a tool.

## Phase Five: Skinning, Chrome, And Identity

Three skins became four. The skin system became coherent across the entire shell:

- **Deck** -- dark gunmetal chrome, cyan accent
- **Orbiter** -- warmer chrome, teal-green accent
- **Forge** -- reactor gold on black
- **Phantom** -- deep violet neon on obsidian

At this stage the shell started feeling authored instead of merely themed.

## Phase Six: Secure View And The Rename

Once the shell became visually distinctive, screenshots started mattering. That created a new problem: a local-ops shell is full of machine-specific details. Secure View was added so demos and docs could show the real product without leaking local endpoints and paths.

The project was renamed from HYDRA to HELM. Config auto-migrated from `~/.config/hydra` to `~/.config/helm`. Pages were collapsed from 8 to 7 with zero panel duplication. This became v4.0.0.

## Phase Seven: Agent Registry And Sentinel

Two additions that shifted HELM from a real-time monitor to something with memory and autonomy:

**Agent Registry** is the Hall of Fame. A permanent historical record of every agent, tool, and project ever built, ranked by impact score, with stack info, key outputs, lessons learned, and lineage tracking. It answers the question "what have I actually shipped?" instead of just "what's running right now?"

**Sentinel** is a background watcher daemon that polls system state every 30 seconds and fires alerts through configurable channels (macOS notifications, Obsidian vault logs, Slack). Seven rules monitor for agent crashes, CPU/memory pressure, port conflicts, service failures, and long-running sessions. It's the first step toward HELM being proactive instead of passive.

The Registry page brought the navigation to 8 pages. 235 tests across 25 suites.

## What HELM Is Now

HELM is a local-ops shell with four pillars:

1. **Operational posture** for the workstation, its repos, and its processes.
2. **Agent awareness** for live AI sessions and a historical record of everything built.
3. **Intelligence** through local-model briefings, auto-heal, and the Sentinel watcher.
4. **Identity** through the FM radio deck, shell skins, and a design language that makes daily ops feel like operating a machine, not staring at a spreadsheet.

~18k lines of TypeScript. 235 tests. 98 source files. All charts hand-rolled SVG. No charting library.

## What Still Matters Next

- Connection-level network topology (in progress on a worktree)
- Sentinel rule expansion and in-app notification panel
- v5.0.0 release with the registry, sentinel, and accumulated improvements
- Keep security-first defaults as the shell gets more expressive
