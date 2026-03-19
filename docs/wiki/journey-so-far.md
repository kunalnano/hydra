# Hydra: The Journey So Far

Hydra did not start as a shell. It started as a dense desktop dashboard for watching processes, ports, agents, git repos, and local AI health without hopping between terminal panes all day. The first useful version proved the monitor stack, but it also proved the limit of the one-big-wall approach.

## Phase One: Make The Machine Visible

The first milestone was operational visibility:

- process grouping by workspace, service, and agent
- port inspection and listener mapping
- git drift across multiple repositories
- local AI briefings through LM Studio
- persistence for snapshots, briefings, alerts, and notifications

That version made Hydra useful, but it still behaved like a panel graveyard. Everything shouted at once.

## Phase Two: Turn The Dashboard Into A Shell

The next major shift was structural. Hydra stopped trying to be one overloaded cockpit and turned into a real shell with purpose-built pages:

- `Overview` for posture
- `Workspaces` for repo and process cleanup
- `Agents` for swarm state
- `Systems` for infrastructure and security
- `AI` for the operator-facing model loop
- `FM Radio` for the built-in audio deck
- `Usage` for Claude Code telemetry
- `Activity` for logs and history

This was the point where navigation stopped being decorative. The side rail became the real contract of the app.

## Phase Three: Yennefer Gets A Real Stage

The AI page used to share space with too many neighboring widgets. Over time it was pared down and rebuilt around the local-model loop itself:

- briefings
- repair actions
- Yennefer invocation
- lens control
- live swarm and machine readout

The visual language also changed. The old globe experiments led to the current mech entity: armor, antennas, and reactor motion instead of another generic network orb. That gave Hydra a clearer identity and made the AI page the obvious showcase surface.

## Phase Four: FM Radio Becomes Real

`FM Radio` started as a mood-board idea and turned into a proper desktop feature:

- preset stations
- search and filtering
- play and pause
- volume control
- custom direct stream loading
- local MP3 import
- a main-process relay so playback survives the Electron renderer’s fragile direct-stream path

This was also where Hydra leaned harder into software as a toy as well as a tool. The Winamp influence became explicit instead of implied.

## Phase Five: Skinning, Chrome, And Identity

Hydra moved away from generic frosted-glass UI toward a tighter machine-chrome shell. The skin system became coherent across the whole surface instead of living in isolated panels:

- `Deck`
- `Orbiter`
- `Forge`

At this stage the shell finally started feeling authored instead of merely themed.

## Phase Six: Secure View And Safer Showcases

Once Hydra became visually distinctive, screenshots started mattering. That created a new problem: a local-ops shell is full of machine-specific details. `Secure View` was added so demos and documentation could show the real product without leaking:

- local LM Studio endpoints
- loopback hosts
- filesystem paths
- other machine-specific identifiers that do not belong in public docs

This changed the documentation workflow as much as the UI itself.

## What Hydra Is Now

Hydra is now a local-ops shell with three strong pillars:

1. Operational posture for the workstation and its repos.
2. A dedicated local-AI control surface centered on Yennefer.
3. A playful but functional desktop layer, including the FM radio deck and shell skins.

## What Still Matters Next

Hydra still has open work:

- tighten runtime reliability around Electron startup and capture behavior
- keep the screenshot and release-note pipeline disciplined
- continue making `Staff of Gandalf` and the AI page feel more alive without losing operational clarity
- keep security-first defaults in place as the shell gets more expressive

That is the journey so far: from useful monitor wall, to real operator shell, to something with a point of view.
