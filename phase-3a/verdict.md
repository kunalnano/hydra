# Phase 3A Verdict — HELM Observability Readiness

**Date:** 2026-04-24
**Scope:** Read-only audit of all HELM renderer components for DOM/a11y observability.
**Source tree audited:** `src/renderer/src/panels/` (30 files) + `src/renderer/src/components/` (9 files).

## Is HELM safe to integrate wterm into? **YES, CONDITIONAL ON CLEANUP**

Safe to proceed to Phase 3B. The audit found **zero canvas-only observability blockers** in HELM's current source. Every meaningful state an observing agent would need to reason about any panel is present in the DOM accessibility tree via one of:

1. Plain HTML text content (the overwhelming majority — 22 of 39 surfaces)
2. SVG `<text>` or DOM-adjacent value spans (GaugeArc, any Mixed panel with sibling readouts)
3. ARIA-annotated buttons (NetworkTrafficGrid peer labels via `sr-only` + `title`)
4. Parent-panel DOM that carries state shared with a decorative canvas child (RadioRippleVisualizer, SkinGlobe, AICoreNode)

The 2026-04-24 spec named **RadioSignalGlobe** as the "1 confirmed canvas-only blocker." This audit downgrades that to **LOW risk**. The current source code at `components/RadioSignalGlobe.tsx:414–434` renders three DOM `SignalCard`s carrying station origin, receiving endpoint, and path distance/detail. The canvas beside them is a decorative d3-geo globe, not the state carrier. Either the spec was authored against an older file, or the preliminary intuition was wrong. Either way, the blocker claim does not survive source review.

## Phase 3B integration scope recommendation

Per `terminal-panel-finding.md`, **Phase 3B is net-new integration, not replacement.** Zero matches across the repo for `xterm`, `node-pty`, `pty.js`, `@xterm`, `@wterm`. No existing terminal code to migrate or deprecate.

Recommended Phase 3B scope, in order:

1. **Add deps**: `@wterm/core`, `@wterm/dom`, `@wterm/react`, `node-pty` to `hydra/package.json` via `npm install`. Follow `fix-perms.mjs` precedent from the spike for node-pty's spawn-helper permissions.
2. **Pick a page or create one**: decide whether the terminal lives on an existing page (e.g., add to Swarm alongside HiveLauncher, since that's where external session launch flows already live) or warrants a new `terminal` / `shell` page in `PAGES`.
3. **Add `Terminal.tsx` panel**: wraps `@wterm/react`'s `Terminal` component, connects to a local PTY server over WebSocket. Two options for where the server lives:
   - **Option A (recommended):** run Phase 2's shared-PTY `server.mjs` as a spawn of HELM's main process. Reuses all Phase 2 architecture (/pty, /observe, ring buffer, grace, health) without refactor. HELM owns the PTY lifecycle; observers (like Aisling or remote HELM windows) can attach to `/observe`.
   - **Option B:** port the server into main/ as a native Electron process. Cleaner distribution; loses the proven spike code; higher risk.
4. **Do NOT touch existing HELM panels** to add a11y — apply the three optional cleanup items (below) as separate follow-up work, independent of wterm integration.

## Required fixes before integration

**None.** The baseline is clean.

## Optional cleanup items for Phase 3B or later (not integration-blocking)

These are the three medium-risk surfaces where meaningful visual state isn't in the DOM. Each is a small diff (1–3 lines). Apply separately from the wterm integration so the audit baseline stays crisp:

1. **`components/NetworkTrafficGrid.tsx`** — add an `aria-live` summary line or `sr-only` per-peer bandwidth readout so observers can tell which peer is currently heaviest. Peer identity is already in DOM; only rate magnitude is canvas-only.

   ```tsx
   <span className="sr-only" aria-live="polite">
     {peer.label}: {rateLabel(peer)} ({scope.label})
   </span>
   ```

2. **`components/Sparkline.tsx`** — add a `<title>` element inside the `<svg>` with range + current value. Low-priority because every current call site renders the underlying numbers in DOM siblings.

   ```tsx
   <svg ...>
     <title>{data[data.length - 1]} (range {Math.min(...data)}–{Math.max(...data)})</title>
     {/* ... existing polygon + polyline ... */}
   </svg>
   ```

3. **`components/DonutChart.tsx`** — add a `<title>` listing `{segment.label}: {segment.value}` per segment. Same low-priority rationale as Sparkline.

None of these require a branch, feature flag, or migration plan. They are pure additions.

## What Phase 3A did NOT do

- **Live browser/Electron snapshot evidence.** `hydra/node_modules/` is not installed and a full `npm install` + `npm run dev` under an Electron headful launch was outside the 60-min audit budget. The component-level audit (Job 1) is fully complete based on source review; the live-snapshot portion (Job 2) is deferred. Hank can run `agent-browser snapshot` against HELM manually in one sitting once the app is launched; the expected outcome (given the source audit) is that every page's accessibility tree will be readable with the caveats already documented in the canvas-only inventory.
- **No source modifications.** Zero files in `src/` changed. The only writes to the hydra repo are the four markdown deliverables in `phase-3a/`.
- **No branch cut.** Deliverables go to `phase-3a/` as plain docs; whether Hank wants to commit them on `experiment/wterm-phase-3a` or fold them into main is a git-ops decision, not an audit-output decision.

## Phase 3B readiness checklist

- [x] Terminal-panel existence definitively confirmed — none exists (net-new integration)
- [x] Every panel + component classified (no "probably" / "likely" remaining)
- [x] Canvas-only inventory with prescribed fixes
- [x] Integration verdict: SAFE, no blockers
- [x] No HELM source code modifications
- [ ] Live a11y evidence per page — **deferred, see above**
- [x] Session note + catalog row — written

**Phase 3B green-lit.** Recommend starting with Option A (spawn Phase 2 `server.mjs` from HELM's main process) and adding a single new Terminal panel. The three optional a11y fixes can land before, during, or after — their timing does not gate integration.
