# Canvas-Only / SVG-Decorative State Surfaces

This inventory lists every HELM surface where state is NOT directly readable from a DOM accessibility snapshot, along with what the user sees, what an observing agent misses, and a prescribed fix.

**Spike-corrected scope.** The 2026-04-24 preliminary audit named RadioSignalGlobe as the sole confirmed blocker. The current source code tells a different story: the meaningful state (station location, callsign, frequency, home endpoint, distance, route detail) is rendered in three DOM `SignalCard`s at `components/RadioSignalGlobe.tsx:414–434`. The canvas is a decorative d3-geo globe. Downgrade from BLOCKER to LOW.

The inventory below is what's actually in the codebase as of this audit.

---

## 1. `components/NetworkTrafficGrid.tsx` — MEDIUM (not a blocker)

**Canvas usage:** line 158+ (`getContext('2d')` via `canvasRef.current.getContext('2d')`), render loop at `requestAnimationFrame`.

**DOM-visible state (already present):**
- Peer labels: each peer rendered as an interactive `<button>` with `<span className="sr-only">{peer.label}</span>` + `title="{peer.label} • {scope.label}"` (line 309–316).
- Scope label in the button tooltip.
- "Traffic Grid" header text.
- Selection state in button class variants.

**Canvas-only state (missing from DOM):**
- Per-peer bandwidth rate (rendered as line width and animation speed between center and peer).
- Scope-ring visual separation (loopback/LAN/internet rings).
- Relative traffic volume between peers.

**User sees:** animated traffic lines from HOST to peers, thicker/faster lines = heavier traffic; concentric rings for scope grouping.

**Agent sees:** peer names in button labels, can identify who is connected. Cannot tell which peer is currently receiving/sending the most traffic.

**Prescribed fix (Phase 3B cleanup, not blocker):**
```tsx
<span className="sr-only" aria-live="polite">
  {peer.label}: {formatBandwidth(peer.bytesIn)} in, {formatBandwidth(peer.bytesOut)} out, scope {scope.label}
</span>
```
Or: emit a single aria-live summary line listing the top-3 peers by throughput, updated every ~2s.

---

## 2. `components/Sparkline.tsx` — MEDIUM (not a blocker)

**SVG usage:** `<polyline points="x,y x,y ...">` only. No `<text>`, no `<title>`, no `aria-label`.

**DOM-visible state:**
- None directly. The `data: number[]` prop is consumed to compute `points` but not persisted as attributes.

**SVG-decorative state:**
- Shape of the trend (coordinates technically in the `points` attribute, but agents would have to reverse-engineer the polyline math to extract values).

**User sees:** 32px-tall sparkline indicating recent trend.

**Agent sees:** an `<svg>` with a `<polyline>` whose `points` attribute holds raw coordinates. Not human-meaningful without interpretation.

**Why it's not a blocker:** every current Sparkline call site (`CCUsage`, `Scorecard`, `ScorecardsStrip`) renders the corresponding numeric values in DOM siblings (current total, formatted cost, etc.). Agents reading the panel's DOM get the numbers; the sparkline is visual reinforcement.

**Prescribed fix (if Sparkline is ever used standalone):**
```tsx
<svg ...>
  <title>{data[data.length-1]} (range {min}-{max} over last {data.length})</title>
  <polyline ... />
</svg>
```
Plus a `data-values={JSON.stringify(data)}` attribute on the container.

---

## 3. `components/DonutChart.tsx` — MEDIUM (not a blocker)

**SVG usage:** `<circle>` elements with `strokeDasharray`/`strokeDashoffset` to encode segment proportions. No per-segment `<text>` or `<title>`.

**DOM-visible state:**
- None in the chart itself.

**User sees:** colored ring segments proportional to their values.

**Agent sees:** SVG circles with stroke colors and dasharray values. Proportions derivable with math; segment labels unavailable.

**Why it's not a blocker:** callers render the legend separately as DOM text (verified at call sites: Scorecards strip displays numeric labels alongside the donut).

**Prescribed fix (Phase 3B cleanup):**
```tsx
<svg ...>
  <title>{segments.map(s => `${s.label}: ${s.value}`).join(', ')}</title>
  {segments.map(s => <circle key={s.label}>{/* ... */}</circle>)}
</svg>
```

---

## 4. `components/RadioRippleVisualizer.tsx` — LOW (intentionally decorative)

**Canvas usage:** full canvas render loop, physics simulation of water ripple driven by audio playback state and volume (lines 64–225).

**Semantic marker:** container has `aria-hidden="true"` on line 228 — the author explicitly told screen readers to ignore this.

**DOM-visible state (in parent FMRadio):** playback status (playing/paused/loading), volume %, station name. All are rendered as DOM text in the FMRadio panel.

**User sees:** water droplet rippling with audio — a "winamp visualizer" homage.

**Agent sees:** nothing, correctly. State lives elsewhere.

**Prescribed fix:** none. The `aria-hidden` treatment is the right call. Only worth a revisit if someone makes RadioRippleVisualizer independently meaningful (e.g., rendering it in a context where FMRadio's DOM is not adjacent).

---

## 5. `components/SkinGlobe.tsx` — LOW (decorative)

**Canvas usage:** rotating globe decoration, arcs between endpoints (lines 113–225).

**DOM-visible state:** skin selection is driven by the `SkinSelectorPanel` form controls in `App.tsx:248–296` (`<SkinCard>` buttons with skin label, active badge, blurb). The globe sits alongside but does not carry state unique to itself.

**User sees:** a rotating 3D globe in the skin selector modal, with dashed arcs for visual flair.

**Agent sees:** the form controls with skin names and active state. Loses nothing meaningful.

**Prescribed fix:** none. If the globe is ever reused outside the skin selector context, revisit — for now the callsite carries state.

---

## 6. `components/RadioSignalGlobe.tsx` — LOW (DOM cards cover state)

**Canvas usage:** d3-geo orthographic projection + `CanvasRenderingContext2D` rendering of globe, markers, great-circle arc (lines 229–376).

**DOM-visible state (verified at lines 414–434):**
```tsx
<SignalCard label="Origin"    value={station.location}        detail={`${callSign} · ${frequency}`} />
<SignalCard label="Receiving" value={deviceLocation.label}    detail={receivingDetail} />
<SignalCard label="Path"      value={pathValue}               detail={pathDetail} />
```
All three cards render as DOM `<div>`s with visible label/value/detail text.

**Canvas-only state:** visual map, marker positions in pixel space, animated arc. None of this is semantic — it's a visualization of the values the cards already carry.

**Prescribed fix:** none. This is the headline correction of the audit: the spec's preliminary blocker claim was based on the intuition that station info was canvas-only, but the current source pairs the canvas with explicit DOM cards.

---

## 7. `panels/AICoreNode.tsx` — LOW (decorative mech mascot)

**Canvas usage:** animated "mech entity" rendered in `<canvas>` (lines 420+). Antennas, armor plates, circuit nodes react to mode/CPU/mem parameters.

**DOM-visible state (all present in the return JSX, lines 399–521):**
- `SYS.CORE.ENTITY` label
- `theme.label` (mode name, e.g., "THROUGHPUT")
- `MECH.ORGANISM` sub-label
- Entity kind counts: `WS {n}`, `AG {n}`, `PT {n}`, `GIT {n}` each with color swatch
- `Yennefer {titleCase(style)}` style indicator
- Mode badge "live"
- Interface section: `Yennefer Lens`, endpoint URL, Secure View chip (conditional)
- `Lens Control` `<select>` with Adaptive/Throughput/Creative/Strict options
- `MetricPill`s: Swarm `N/M active`, Memory `X%`, CPU `Y%`, Ports `Z listeners`
- `Readout` block: mode label + detail prose
- Three `ActionNode` buttons: Request Briefing / Invoke Repair / Invoke Yennefer

**Canvas-only state:** the mech mascot's appearance (antenna length, armor breathing, glow intensity) responds to the same parameters already rendered in the DOM pills. Purely cosmetic.

**User sees:** a visually rich animated mascot framing a full panel of numeric readouts.

**Agent sees:** the full panel of numeric readouts.

**Prescribed fix:** none. The audit agent's subagent initially flagged this as a blocker; that was an over-call. The DOM carries every number and label; the canvas is decoration.

---

## Summary

| Surface | Severity | Blocker for Phase 3B? |
|---------|----------|------------------------|
| NetworkTrafficGrid bandwidth | Medium | No (peer identity in DOM; rate loss is a cleanup) |
| Sparkline standalone | Medium | No (numeric values in DOM at every call site) |
| DonutChart standalone | Medium | No (numeric legends in DOM at every call site) |
| RadioRippleVisualizer | Low | No (intentionally aria-hidden, state in FMRadio DOM) |
| SkinGlobe | Low | No (state in form controls) |
| RadioSignalGlobe | Low | No (SignalCards carry state) — DOWNGRADED from spec's BLOCKER |
| AICoreNode canvas | Low | No (state in DOM MetricPills + labels) |

**Zero blockers.** Three optional Phase 3B cleanup items (NetworkTrafficGrid bandwidth labels, Sparkline `<title>`, DonutChart `<title>`). None required before integration.
