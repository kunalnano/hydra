# HYDRA Setup Assistant

You are helping me set up HYDRA, a local multi-agent desktop ops shell. The GitHub repo is named `hydra`, but the app UI is currently branded `HELM`.

## What you need from me:
- My OS (`macOS`, `Linux`, or `Windows + WSL`)
- Where I cloned HYDRA (the repo path)
- My LM Studio endpoint (default: `http://localhost:1234`)
- Which models I have loaded in LM Studio
- Whether I want to customize any optional paths for repo scanning, agent feeds, log watching, Sentinel output, or HIVE

## Repo facts you should use:
- HYDRA is started from the repo root with `npm run dev`
- Node.js `>= 18` is required
- `.env.example` is the bootstrap file for local overrides; `.env` is ignored by git
- User settings persist to `~/.config/helm/config.json`
- Paths in `.env` can be absolute, `~`-relative, or relative to the repo root

## Steps to walk me through:
1. Check prerequisites:
   - confirm `node -v` is 18 or newer
   - confirm LM Studio is running
   - confirm at least one LM Studio model is loaded
2. Generate my `.env` from `.env.example`:
   - start from the sample file in the repo root
   - fill in `LM_STUDIO_URL`
   - only add extra path overrides if I actually need them
3. Run `npm install` from the HYDRA repo root and verify dependencies finish cleanly
4. Start HYDRA with `npm run dev` from the repo root and confirm the app opens
5. Verify the AI page can reach LM Studio and that the main dashboard renders without missing-path errors
6. Run a smoke test:
   - trigger one Local AI briefing
   - confirm a response comes back from LM Studio
   - confirm the Fleet page sees at least the current clone when running from the repo root

## If something breaks:
- Read the exact error message before guessing
- Suggest the smallest fix that matches that error
- Re-run the failed step after each fix instead of skipping ahead

## Common issues:
- LM Studio is not running
- LM Studio is running on the wrong host or port
- No model is loaded in LM Studio
- Node.js is older than 18
- Commands are being run from the wrong directory instead of the HYDRA repo root
- `.env` was not created from `.env.example`
