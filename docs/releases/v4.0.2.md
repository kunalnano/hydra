# HELM v4.0.2

Released March 22, 2026.

This patch removes the first-run setup friction that made clean clones brittle. You can now clone the repo, copy `.env.example` to `.env`, and run from the repo root without editing source paths first.

## What Changed

- Centralized repo-root and packaged-resource path resolution for `.env`, registry seed data, Sentinel config, HIVE role prompts, and helper scripts.
- Replaced the old Fleet default scan root with the current clone when HYDRA is launched from the repo root.
- Added a tracked, commented `.env.example` for optional LM Studio, repo scan, log, Sentinel, HIVE, and ElevenLabs overrides.
- Added an in-app update banner and a command-palette update check so older running clones can see newer releases and changelog links.
- Added a README setup warning with two repair paths:
  - guided setup through `docs/llm-setup-prompt.md`
  - agent-driven repair through `CLAUDE.md`
- Added a path audit doc so the remaining path-shaped strings in tests and docs are explicit instead of hidden runtime debt.

## Setup

1. `cp .env.example .env`
2. `npm install`
3. `npm run dev`

Repo name stays `hydra`. The app window and UI are branded `HELM`.

## Validation

- `npm test`
- `npm run build`
- clean-clone repo-root simulation passed with `.env.example` copied to `.env`
