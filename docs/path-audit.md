# HYDRA Path Audit

Audit date: 2026-03-22

This audit was run after the out-of-box setup patch. The goal was to separate real runtime path debt from expected references in docs, tests, privacy redaction, and migration logs.

## Fixed runtime assumptions

- `src/main/index.ts`
  - `.env` is now loaded from the repo root or an explicit `HELM_ENV_PATH` override instead of `process.cwd()`.
- `src/main/registry.ts`
  - Seed registry lookup is now resolved from repo assets or packaged resources instead of the caller's working directory.
- `src/main/sentinel/index.ts`
  - Sentinel config is now resolved from repo assets or packaged resources, with optional `HELM_SENTINEL_CONFIG_PATH`.
- `src/main/hive/index.ts`
  - Built-in HIVE role prompt paths are now resolved from repo assets or packaged resources.
- `src/main/monitors/firewall.ts`
  - LuLu parser lookup is now resolved from repo assets or packaged resources, with optional `HELM_LULU_PARSER_PATH`.
- `src/main/monitors/git.ts`
  - Default Fleet scanning now uses the current clone when launched from the repo root instead of `~/Documents/ai/myAIProjects`.
- `src/main/intelligence/yennefer.ts`
  - ElevenLabs config now prefers direct env vars and supports `HELM_YENNEFER_ENV_PATH` instead of assuming a separate checkout path.
- `src/main/intelligence/security.ts`
  - Staff scan output now uses a configurable path or the platform temp directory instead of `/tmp/helm-scan-report.md`.
- `src/main/sentinel/notify.ts`
  - Sentinel vault logging is now configurable with `HELM_SENTINEL_VAULT_LOG_DIR` instead of assuming one Obsidian vault layout.
- `src/main/skills.ts`
  - Skill feed root can now be overridden with `HELM_SKILLS_ROOT`.

## Remaining path-shaped strings by category

### Intentional bootstrap and docs references

- `.env.example`
  - Example absolute path syntax for documentation.
  - Example home-relative paths for agent feeds, logs, Yennefer env, and skills root.
- `README.md`
  - Documents persisted config at `~/.config/helm/config.json`.
- `docs/llm-setup-prompt.md`
  - Documents persisted config at `~/.config/helm/config.json`.
- `docs/OPERATOR-WALKTHROUGH.md`
  - Documents persisted config and agent registry paths under `~/.config/helm`.
- `docs/wiki/journey-so-far.md`
  - Historical note about migration from `~/.config/hydra` to `~/.config/helm`.
- `CHANGELOG.md`
  - Historical release notes reference legacy defaults and prior storage locations.
- `CLAUDE.md`
  - Internal architecture notes reference `~/.config/helm`.

### Migration and default-location logs

- `src/main/config.ts`
  - Migration log message references `~/.config/hydra` and `~/.config/helm`.
- `src/main/db/index.ts`
  - Migration log message references `~/.config/hydra/hydra.db` and `~/.config/helm/helm.db`.
- `src/main/intelligence/security.ts`
  - Comment documents well-known binary lookup paths.

### Tests using sample machine paths

- `src/main/config.test.ts`
- `src/main/hive/spawner.test.ts`
- `src/main/intelligence/briefing.test.ts`
- `src/main/intelligence/yennefer.test.ts`
- `src/main/monitors/agent-feeds.test.ts`
- `src/main/monitors/agents.test.ts`
- `src/main/monitors/ccusage.test.ts`
- `src/main/monitors/processes.test.ts`

These remain intentionally literal so parsing and normalization logic is exercised against realistic macOS and Linux path shapes.

### UI copy that describes default external tool locations

- `src/renderer/src/components/HeaderTicker.tsx`
  - Mentions the default `~/.codex/skills` root and now notes that it can be overridden.
- `src/renderer/src/panels/CCUsage.tsx`
  - Mentions the default `~/.claude/stats-cache.json` location.

### Privacy redaction placeholders

- `src/renderer/src/stores/privacy.ts`
  - Uses `/Users/operator` and `C:\Users\operator` as masked display placeholders, not real runtime paths.

### Test-only helpers that call `process.cwd()`

- `src/main/app-paths.test.ts`
- `src/main/config.test.ts`
- `src/main/monitors/git.test.ts`

These verify repo-root-relative resolution and are not part of production runtime behavior.
