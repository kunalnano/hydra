# HELM DOM Observability Audit — Full Table

**Method:** Source read of every file under `src/renderer/src/panels/` (30 files: 26 components + 4 data modules) and `src/renderer/src/components/` (9 files). For each component, inspected the return JSX and every `getContext('2d'|'webgl')` call. For data modules, marked N/A.

**Classification buckets:**
- **DOM** — state rendered to standard HTML elements (divs, spans, buttons, inputs, selects) with text content or ARIA.
- **SVG-readable** — SVG with `<text>`, `<title>`, or inline `aria-label` carrying values.
- **SVG-decorative** — SVG used as a visualization without text/title/labels. State encoded in `points`/`strokeDasharray` only.
- **Canvas-only** — `<canvas>` with `CanvasRenderingContext2D`/WebGL. State is painted pixels.
- **Mixed** — genuine blend of DOM-visible state with canvas/SVG-decorative visualization.
- **N/A** — data module, not a render surface.

**"Meaningful state"** = data/values/labels/controls an observing agent needs to reason about the panel. Decorative visuals (gradients, glow, animation, background textures) do not count.

## Panels (`src/renderer/src/panels/`)

| File | Classification | Meaningful state | DOM-visible? | Risk | Required fix |
|------|---------------|------------------|--------------|------|--------------|
| Agents.tsx | DOM | Agent name, type, status, working dir, model, PID, uptime, CPU, mem | yes | low | — |
| AICoreNode.tsx | Mixed | Mode label, kind counts (WS/AG/PT/GIT), endpoint, Yennefer style, MetricPills (Swarm N/M, Mem %, CPU %, Ports count), Readout prose, action buttons | yes | low | — (canvas is a decorative mech-mascot; every value above is rendered in DOM `text` / `span` / `MetricPill`) |
| BrickQueue.tsx | DOM | Brick rows (title, status, assignee), filter tabs, approve/reject actions | yes | low | — |
| Briefing.tsx | DOM | Briefing text, key findings list, action buttons, compact/full variants | yes | low | — |
| CCUsage.tsx | Mixed | Token totals (in/out), cost USD, source label, timestamps, trend Sparkline | partial | medium | Sparkline is SVG-decorative; numeric totals ARE in DOM. Consider `aria-label` on the Sparkline container with last-N datapoints or range. Not a blocker — numbers are already readable. |
| CommandCenter.tsx | DOM | Process groups, CPU/mem, git status, ports, freeze/kill buttons | yes | low | — |
| CommandPalette.tsx | DOM | Command list, search input, selection highlight | yes | low | — |
| FMRadio.tsx | Mixed | Station name, callsign, frequency, play/pause, volume %, preset list | yes | low | Volume meter is canvas, but volume % is rendered in DOM. Panel body is DOM; only decorative winamp-style skin chrome is canvas. |
| GitHistory.tsx | DOM | Commit hash, author, message, date, repo | yes | low | — |
| GitStatus.tsx | DOM | Branch, ahead/behind, dirty count, remote | yes | low | — |
| HiveLauncher.tsx | DOM | Session list, role, model, working dir, spawn/attach/kill buttons | yes | low | — |
| Logs.tsx | DOM | Log lines with level, source, timestamp | yes | low | — |
| Network.tsx | Mixed | Per-peer label + scope via DOM buttons; uses NetworkTrafficGrid for canvas viz | partial | medium | Uses `NetworkTrafficGrid` — see components table. Peer names and scope labels ARE in DOM; bandwidth rates are canvas-only. |
| Notifications.tsx | DOM | Notification message, severity, dismiss actions | yes | low | — |
| Ports.tsx | DOM | Port number, process name, state, owner | yes | low | — |
| Registry.tsx | DOM | Agent registry entries, rank, metadata | yes | low | — |
| ScorecardsStrip.tsx | Mixed | Scorecard numbers (DOM) + sparkline trend (SVG-decorative) | partial | low | Numeric values DOM-visible; trend loss is acceptable — agent can infer direction from historical snapshots |
| Security.tsx | DOM | Scan results, alerts, severity, remediation text | yes | low | — |
| Timeline.tsx | DOM | Event type, message, relative time; DOM list with no canvas | yes | low | — |
| VaultChunkViewer.tsx | DOM | Chunk content, metadata | yes | low | — |
| VaultPage.tsx | DOM | Vault shell wrapping VaultSearchBar/ResultsList/ChunkViewer/StatusBar | yes | low | — |
| VaultPushModal.tsx | DOM | Modal form fields, submit/cancel | yes | low | — |
| VaultResultsList.tsx | DOM | Result rows with path, score, snippet | yes | low | — |
| VaultSearchBar.tsx | DOM | Search input, filters | yes | low | — |
| VaultStatusBar.tsx | DOM | Status text, connection state | yes | low | — |
| Workspaces.tsx | DOM | Workspace list, metrics | yes | low | — |
| fm-stations.ts | N/A | data module | N/A | N/A | N/A |
| globe-data.ts | N/A | data module | N/A | N/A | N/A |
| mech-entity.ts | N/A | data module (animation params for AICoreNode) | N/A | N/A | N/A |
| phyllotaxis-data.ts | N/A | data module | N/A | N/A | N/A |

## Components (`src/renderer/src/components/`)

| File | Classification | Meaningful state | DOM-visible? | Risk | Required fix |
|------|---------------|------------------|--------------|------|--------------|
| DonutChart.tsx | SVG-decorative | Segment values encoded in `strokeDasharray`; no `<title>`/`<text>`/label | no | medium | Add `<title>` per segment or a sibling data-row (see canvas-only-inventory.md §DonutChart) |
| GaugeArc.tsx | SVG-readable | Numeric value rendered as `<text>` element inside the SVG, plus DOM value span below | yes | low | — |
| HeaderTicker.tsx | DOM | Ticker item text (status, agent action, skill updates) rotating via React state | yes | low | — |
| NetworkTrafficGrid.tsx | Mixed | Peer labels in DOM buttons (`<span className="sr-only">{peer.label}</span>` + `title="..."`), scope label visible in `SCOPE_META[peer.scope].label`; bandwidth rates painted to canvas as line widths only | partial | medium | Add a DOM `data-bandwidth` attribute or a visually-hidden `aria-live` summary line showing `{peer.label} · {rate} bps` for each peer |
| RadioRippleVisualizer.tsx | Canvas-only (aria-hidden, decorative) | Audio volume/status visualized as ripple physics. Status AND volume are also rendered in the parent FMRadio DOM. | n/a (decorative) | low | Confirmed intentional `aria-hidden="true"` on line 228 — decorative only. State carried by FMRadio. |
| RadioSignalGlobe.tsx | Mixed | Canvas shows animated d3-geo globe with great-circle arc. DOM `SignalCard`s (Origin, Receiving, Path) carry station location, callsign, frequency, home endpoint, distance, route detail. | yes | low | — (spec's blocker claim was based on an older file; the current SignalCard trio at lines 414–434 covers all meaningful state) |
| Scorecard.tsx | Mixed | Big number + title in DOM; optional embedded Sparkline is SVG-decorative | yes | low | Primary value DOM-visible. Trend loss acceptable. |
| SkinGlobe.tsx | Canvas-only (decorative) | Selected skin preview (rotating globe). Skin selection is a form control rendered in DOM by `SkinSelectorPanel` (`<SkinCard>` buttons with skin name, `active` badge). | n/a | low | No meaningful state lives only in the globe — skin choices and active skin are both in DOM |
| Sparkline.tsx | SVG-decorative | Data array encoded as `<polyline points="...">`. No `<text>`, `<title>`, or `aria-label` | no | medium | Not integration-blocking if callers carry numeric state in DOM siblings (CCUsage, Scorecard do). If the Sparkline needs to be independently observable, add `<title>{minval} → {maxval}, current {current}</title>` |

## Summary counts

| Bucket | Count | Notes |
|--------|-------|-------|
| DOM | 22 | Fully observable |
| SVG-readable | 1 | GaugeArc (DOM value + SVG text) |
| SVG-decorative | 2 | Sparkline, DonutChart (used with DOM sibling labels in all current call sites) |
| Canvas-only, decorative (aria-hidden or state-elsewhere) | 2 | RadioRippleVisualizer, SkinGlobe |
| Mixed | 9 | See individual rows above |
| N/A (data) | 4 | fm-stations, globe-data, mech-entity, phyllotaxis-data |
| **Total files audited** | **40** | |

## Verdict from the table

- **Zero true canvas-only observability blockers in HELM.**
- The spec's preliminary audit called RadioSignalGlobe a blocker — the current source has DOM `SignalCard`s carrying every state the spec worried about. Downgrade to LOW risk.
- Three fixes would lift medium-risk items to low-risk (NetworkTrafficGrid bandwidth labels, Sparkline/DonutChart aria-titles). **None are required for Phase 3B integration.**
- Recommendation: integrate wterm as a net-new panel; defer the three medium-risk fixes to Phase 3B cleanup.
