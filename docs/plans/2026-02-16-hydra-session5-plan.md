# HYDRA Session 5: Visual Storytelling + Scorecards

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform HYDRA from a text-heavy data display into a visual dashboard with at-a-glance scorecards, sparkline charts, and structured security posture visualization. Anyone glancing at the screen should instantly know system health, security exposure, and what their setup is being used for.

**Architecture:** Pure SVG components for charts (no dependencies). Ring buffer in the Zustand store for time-series data (60 snapshots = ~2min at 2s intervals). Scorecard component pattern reused across all panels. Security panel redesigned around Staff of Gandalf's structured JSON output (PostureReport with 5 scored categories). Grid layout reorganized: top row = scorecards strip, remaining rows = detail panels.

**Tech Stack:** React SVG components (sparklines, gauges, donut charts), Zustand store extensions for time-series, Staff of Gandalf `--json` + `--home` flags for structured scan output.

---

### Task 1: Scorecard Component + SVG Primitives

**Files:**

- Create: `src/renderer/src/components/Scorecard.tsx`
- Create: `src/renderer/src/components/Sparkline.tsx`
- Create: `src/renderer/src/components/GaugeArc.tsx`
- Create: `src/renderer/src/components/DonutChart.tsx`

Build reusable visual components:

1. **Scorecard** — a compact card with: big number/grade, label, trend arrow (up/down/flat), color (green/amber/red), optional sparkline underneath. Props: `value: string`, `label: string`, `trend?: 'up' | 'down' | 'flat'`, `color: 'green' | 'amber' | 'red' | 'blue'`, `sparkData?: number[]`.

2. **Sparkline** — pure SVG polyline. Props: `data: number[]`, `width?: number`, `height?: number`, `color?: string`, `filled?: boolean`. Normalizes data to fit within bounds. Renders a smooth path with optional gradient fill below.

3. **GaugeArc** — SVG semi-circular arc gauge (like a speedometer). Props: `value: number` (0-100), `grade?: string`, `color: string`, `size?: number`. Shows the arc filled to `value%` with the grade letter in the center.

4. **DonutChart** — SVG donut/ring chart. Props: `segments: { value: number, color: string, label: string }[]`, `size?: number`. Ring with colored segments, total in center.

All components: no dependencies, pure SVG, dark-theme colors, consistent sizing.

---

### Task 2: Time-Series Store + Ring Buffer

**Files:**

- Modify: `src/renderer/src/stores/system.ts`
- Create: `src/renderer/src/stores/timeseries.ts`

Build a time-series store:

1. New Zustand store `useTimeSeriesStore` with:

   - `cpuHistory: number[]` — last 60 CPU usage values
   - `memHistory: number[]` — last 60 memory usage values
   - `netInHistory: number[]` — last 60 total bytes-in-per-sec values
   - `netOutHistory: number[]` — last 60 total bytes-out-per-sec values
   - `push(cpu, mem, netIn, netOut)` — appends to each array, keeps max 60 entries (ring buffer behavior via slice)

2. Modify `system.ts` to call `useTimeSeriesStore.getState().push(...)` whenever a new SystemState arrives in the `onSystemStateUpdate` callback.

---

### Task 3: Scorecards Strip (Top Row)

**Files:**

- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/panels/ScorecardsStrip.tsx`

Build a horizontal strip of 5 scorecards that sits at the top of the dashboard:

1. **System Health** — CPU usage as the big number, color-coded (green <50%, amber <80%, red ≥80%), sparkline of last 60 CPU samples.

2. **Memory** — Memory usage %, same color thresholds, sparkline of memory history.

3. **Network** — Total bandwidth (in+out) as big number, formatted human-readable. Sparkline of combined network history. Color: blue always.

4. **Agents** — Count of active agents as big number. Color: green if any active, gray if none. Trend: based on status changes.

5. **Security** — Grade letter (A-F) from last Staff of Gandalf scan, or "—" if no scan run yet. Color: green (A-B), amber (C), red (D-F). This scorecard is clickable and scrolls to the Security panel.

Update App.tsx grid:

- New top row: scorecards strip (col-span-2, short fixed height ~80px)
- Remaining rows as before but adjusted: `grid-rows-[auto_1fr_1fr_1fr_1fr_minmax(160px,1fr)]`

---

### Task 4: Enhanced Workspaces Panel with Visual Indicators

**Files:**

- Modify: `src/renderer/src/panels/Workspaces.tsx`

Enhance the Workspaces panel for visual clarity:

1. Add inline mini CPU bar next to each workspace — a small horizontal bar (40px wide) with fill proportional to CPU usage, color-coded (green/amber/red).
2. Add a type icon/badge that's more prominent — colored dot + label in a pill shape (e.g., blue pill "PRJ", amber pill "AI", green pill "SVC").
3. When expanded, show process table with alternating subtle row backgrounds for readability.
4. Add a column header legend row at the top of the panel: "Workspace | Type | Procs | Ports | CPU | MEM" in muted uppercase.

---

### Task 5: Enhanced Agents Panel with Column Layout

**Files:**

- Modify: `src/renderer/src/panels/Agents.tsx`

Enhance the Agents panel:

1. Add a legend/header row at top: "Agent | Workspace | Status | PID" in muted uppercase text.
2. Make the status badge larger and more visible — pill-shaped with background color (green bg for active, amber bg for waiting, gray bg for idle).
3. Show agent uptime if available (e.g., "2h 15m").
4. Agent type icon: small colored icon before the name (distinct per type).

---

### Task 6: Network Panel with Sparklines + Bandwidth Chart

**Files:**

- Modify: `src/renderer/src/panels/Network.tsx`

Redesign the Network panel:

1. Replace the text summary bar with a visual bandwidth area chart (using Sparkline component). Two overlapping sparklines: green for download, blue for upload, with gradient fill.
2. Keep the per-process list but add tiny inline sparklines (20px wide) next to each process showing its individual traffic trend (store per-process history in local component state, last 30 samples).
3. Add a legend below the chart: "▼ Download | ▲ Upload" with current totals.

---

### Task 7: Security Panel Overhaul — Posture Score + Structured Results

**Files:**

- Modify: `src/main/intelligence/security.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/src/panels/Security.tsx`

This is the biggest change. Redesign the security integration:

**Backend changes:**

1. Update `security.ts` to pass `--home --json` to Staff of Gandalf commands that support it (survey, illuminate, shadowfax, delve). For scry, pass a default domain.
2. Add a new type `SecurityPosture` to `types.ts`:

```typescript
export interface SecurityPosture {
  overallScore: number // 0-100
  grade: string // A-F
  verdict: string // Gandalf's one-liner
  categories: {
    name: string
    score: number
    weight: number
    summary: string
  }[]
}
```

3. Parse the JSON output from `staff survey --home --json` to extract the posture report.
4. Add IPC channel `SECURITY_POSTURE` for sending posture data to renderer.

**Frontend changes:**

5. Top section: GaugeArc showing the posture grade (A-F) with color, plus the verdict text.
6. Below the gauge: 5 category bars (Attack Surface, Critical Exposure, Encryption, Version Hygiene, Topology) — each as a horizontal bar chart showing score out of 100 with color coding.
7. Firewall summary stays as a compact line.
8. Scan buttons redesigned: primary action "Scan Home Network" (runs survey --home), secondary row for individual commands.
9. Results area shows structured findings by severity instead of raw text — critical findings in red cards, warnings in amber, info in gray.

---

### Task 8: Firewall Donut Chart

**Files:**

- Modify: `src/renderer/src/panels/Security.tsx` (or inline in Network panel)

Add a small donut chart showing the allow/block ratio from LuLu firewall rules. Place it in the Security panel's firewall section. Green segment for allowed, red for blocked. Total count in the center.

---

### Task 9: Grid Layout Finalization + Polish

**Files:**

- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/assets/main.css`

Final layout adjustments:

1. Grid layout: scorecards strip on top, then 2-col panels below.
2. Add subtle grid line separators between major sections.
3. Panel title bar enhancement: add a subtle icon/dot next to each panel title matching its category color.
4. Ensure all panels have consistent padding and overflow behavior.
5. Header bar: replace text CPU/MEM numbers with mini sparklines inline.

---

### Task 10: Verify Session 5

Run full test suite, build all targets, verify app launches with visual components rendering correctly. Push to GitHub.
