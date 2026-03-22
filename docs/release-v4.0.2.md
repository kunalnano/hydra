# HELM v4.0.2

Released March 22, 2026.

HELM v4.0.2 is the out-of-box setup patch. You can now clone the repo and run it from the repo root without editing source paths first.

## Highlights

- Removed startup dependencies on the caller's working directory.
- Resolved runtime assets such as registry seed data, Sentinel config, HIVE role prompts, and the LuLu parser from the current clone or packaged resources.
- Replaced the old developer-specific Fleet scan default with the current clone when launched from the repo root.
- Added a commented `.env.example` for optional overrides instead of requiring source edits for local paths and endpoints.
- Added `docs/llm-setup-prompt.md` for guided setup through ChatGPT, Claude, or any other LLM assistant.
- Added a README setup warning that points new users either to the onboarding prompt or to `CLAUDE.md` for an agent-driven repair path.

## Validation

- `cp .env.example .env`
- `npm test`
- `npm run build`
