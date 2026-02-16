# HYDRA Session 4: Network + Security Suite

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add network traffic monitoring (per-process bandwidth via nettop), LuLu firewall rule visualization, and Staff of Gandalf security scanning to HYDRA.

**Architecture:** Two new monitors (network.ts, firewall.ts) follow the existing pattern — export async functions called from the orchestrator each cycle. Network data comes from `nettop -P -L 1 -t external`. Firewall rules come from `/Library/Objective-See/LuLu/rules.plist`. Staff of Gandalf integration runs on-demand via shell exec of the `staff` CLI. Two new panels display this data. The grid expands to accommodate them.

**Tech Stack:** Electron (child_process for nettop/staff CLI), plist parsing (xml2js or manual XML parse), React + Tailwind panels, Zustand store extension, Vitest for tests.

---

### Task 1: Types + IPC Channels

**Files:**

- Modify: `src/shared/types.ts`

Add these types and IPC channels:

```typescript
export interface NetworkProcess {
  name: string
  pid: number
  bytesIn: number
  bytesOut: number
  bytesInPerSec: number
  bytesOutPerSec: number
}

export interface NetworkState {
  processes: NetworkProcess[]
  totalBytesInPerSec: number
  totalBytesOutPerSec: number
  timestamp: number
}

export interface FirewallRule {
  path: string // app binary path
  name: string // app display name
  action: 'allow' | 'block'
  type: 'user' | 'system' // user-created vs system default
}

export interface FirewallState {
  rules: FirewallRule[]
  totalAllowed: number
  totalBlocked: number
  lastUpdated: number
}

export interface SecurityScanResult {
  id: string
  command: string // which staff command was run
  output: string // raw narrative output
  timestamp: number
  status: 'running' | 'complete' | 'error'
}
```

New IPC channels:

```typescript
NETWORK_STATE: 'network:state',
FIREWALL_STATE: 'firewall:state',
SECURITY_SCAN_REQUEST: 'security:scan-request',
SECURITY_SCAN_RESULT: 'security:scan-result',
GET_FIREWALL_RULES: 'firewall:get-rules',
```

Add `network` and `firewall` fields to `SystemState` (optional, so existing code doesn't break):

```typescript
network?: NetworkState
firewall?: FirewallState
```

---

### Task 2: Network Monitor

**Files:**

- Create: `src/main/monitors/network.ts`
- Create: `src/main/monitors/network.test.ts`

Build a monitor that:

1. Runs `nettop -P -L 1 -t external -J bytes_in,bytes_out` and parses the output
2. Tracks per-process bytes_in/bytes_out deltas between polls to compute per-second rates
3. Exports `getNetworkActivity(): Promise<NetworkState>`
4. Exports `parseNettopOutput(raw: string): NetworkProcess[]` for testing

The nettop output format (tab-separated):

```
process_name.pid   bytes_in   bytes_out
```

Tests: parse known nettop output, compute rates from two consecutive polls, handle empty output.

---

### Task 3: Firewall Monitor

**Files:**

- Create: `src/main/monitors/firewall.ts`
- Create: `src/main/monitors/firewall.test.ts`

Build a monitor that:

1. Reads `/Library/Objective-See/LuLu/rules.plist` (XML plist)
2. Parses it into `FirewallRule[]` — each entry has a path, action (allow/block), and type
3. Caches result, only re-reads if file mtime changes
4. Exports `getFirewallRules(): Promise<FirewallState>`
5. Exports `parseLuluRules(xmlContent: string): FirewallRule[]` for testing

The plist structure has a `rules` dict where each key is a binary path, and each value has `action` (0=block, 1=allow) and `type` fields.

Tests: parse known plist XML, handle missing file gracefully, cache behavior.

---

### Task 4: Wire Monitors into Orchestrator + IPC

**Files:**

- Modify: `src/main/monitors/index.ts`
- Modify: `src/preload/index.ts`

In the orchestrator:

1. Import `getNetworkActivity` and `getFirewallRules`
2. Add network poll to the 2s interval (alongside existing collectSystemState)
3. Add firewall poll at a slower rate (every 30s, since rules rarely change)
4. Send `NETWORK_STATE` to renderer each cycle
5. Send `FIREWALL_STATE` when it changes
6. Add IPC handlers for `GET_FIREWALL_RULES` and `SECURITY_SCAN_REQUEST`

In preload:

1. Add `onNetworkState(callback)` listener
2. Add `onFirewallState(callback)` listener
3. Add `getFirewallRules()` invoke
4. Add `requestSecurityScan(command)` invoke
5. Add `onSecurityScanResult(callback)` listener

Also add `network` and `firewall` to the SystemState that gets sent each cycle.

---

### Task 5: Security Scan Handler (Staff of Gandalf)

**Files:**

- Create: `src/main/intelligence/security.ts`

Build a handler that:

1. Spawns `staff <command>` via child_process in the Staff of Gandalf venv
2. The venv is at `/Users/alsharma/Documents/ai/myAIProjects/staff-of-gandalf/.venv`
3. Streams output back via IPC as `SecurityScanResult`
4. Supports commands: `survey`, `illuminate`, `shadowfax`, `delve`, `scry`
5. Exports `runSecurityScan(command: string): Promise<SecurityScanResult>`
6. Has proper timeout (60s) and error handling

---

### Task 6: Network Panel

**Files:**

- Create: `src/renderer/src/panels/Network.tsx`

Build a panel that:

1. Subscribes to `onNetworkState` updates
2. Shows per-process network activity sorted by total bandwidth (bytesIn + bytesOut per sec)
3. Each row: process name, PID, download rate (green arrow down), upload rate (blue arrow up)
4. Rates formatted human-readable (B/s, KB/s, MB/s)
5. Total bandwidth shown at top as a summary bar
6. Firewall badge per process: green checkmark if allowed by LuLu, red X if blocked, gray ? if unknown
7. Gets firewall rules from store to cross-reference process paths

---

### Task 7: Security Panel

**Files:**

- Create: `src/renderer/src/panels/Security.tsx`

Build a panel that:

1. Shows firewall summary at top: X allowed, Y blocked apps
2. Has a "Scan" button dropdown with Staff of Gandalf commands (survey, illuminate, shadowfax, delve, scry)
3. Shows scan results as a scrollable narrative output area (monospace, styled like a terminal)
4. Loading state while scan runs
5. History of past scans in this session

---

### Task 8: Update App Grid + Store

**Files:**

- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/stores/system.ts`

Update the system store to hold network and firewall state (separate from SystemState, since they arrive via separate IPC channels).

Update App.tsx grid:

- Row 1: Workspaces | Agents
- Row 2: Git Status | AI Briefing
- Row 3: Network | Security
- Row 4: Ports | Notifications
- Row 5: Logs (col-span-2)

Grid becomes `grid-rows-[1fr_1fr_1fr_1fr_minmax(180px,1fr)]` (5 rows).

---

### Task 9: Verify Session 4

Run full test suite, build all targets, verify app launches with new panels populated.
