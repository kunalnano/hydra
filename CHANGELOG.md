# Changelog

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
