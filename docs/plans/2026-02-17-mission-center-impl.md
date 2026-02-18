# Mission Center Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Hydra from read-only monitoring to an actionable mission control with process kill/freeze/thaw, unified Command Center panel, health scoring, session persistence, timeline, and command palette.

**Architecture:** 5 sequential phases building on the existing Electron 28 + React 18 + Zustand + SQLite stack. Phase 1 (action layer) is the foundation — all other phases depend on it. Phases 3-5 are independently shippable after Phase 2. All new main-process code is pure functions with Vitest tests. All IPC follows the existing pattern: types.ts → preload bridge → ipcMain.handle.

**Tech Stack:** Electron 28, React 18, TypeScript, Zustand, better-sqlite3, Vitest, Tailwind 4. Zero new dependencies.

**Design doc:** `docs/plans/2026-02-17-mission-center-design.md`

**Security note:** The existing codebase uses `child_process.exec()` in monitors (processes.ts, ports.ts, network.ts). New code in `actions.ts` uses `process.kill()` (Node.js built-in signal API) — no shell execution needed for sending signals. The `verifyPidAlive()` helper uses `execFile` (not `exec`) with hardcoded command `ps` and sanitized PID argument to prevent injection.

---

## Phase 1: Action Layer (Kill / Freeze / Thaw)

### Task 1.1: Add types and IPC channel constants

**Files:**

- Modify: `src/shared/types.ts`

**Step 1: Add new types and IPC channels to types.ts**

Add after line 163 (after HydraNotification interface):

```typescript
export type ProcessSignalType = 'SIGTERM' | 'SIGKILL' | 'SIGSTOP' | 'SIGCONT'

export interface ProcessActionResult {
  success: boolean
  pid: number
  signal: ProcessSignalType
  error?: string
}

export interface GroupActionResult {
  results: ProcessActionResult[]
  groupName: string
  totalKilled: number
  totalFailed: number
}
```

Add to the `IPC_CHANNELS` const (after line 191, before `} as const`):

```typescript
  PROCESS_KILL: 'process:kill',
  PROCESS_SIGNAL: 'process:signal',
  PROCESS_KILL_GROUP: 'process:kill-group',
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No new errors related to types.ts

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add process action types and IPC channels for kill/freeze/thaw"
```

---

### Task 1.2: Implement process action handlers

**Files:**

- Create: `src/main/actions.ts`
- Test: `src/main/actions.test.ts`

**Step 1: Write the failing tests**

Create `src/main/actions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isProtectedProcess, validatePid, PROTECTED_PROCESSES } from './actions'

describe('isProtectedProcess', () => {
  it('returns true for protected system processes', () => {
    expect(isProtectedProcess('Finder')).toBe(true)
    expect(isProtectedProcess('WindowServer')).toBe(true)
    expect(isProtectedProcess('loginwindow')).toBe(true)
    expect(isProtectedProcess('kernel_task')).toBe(true)
  })

  it('returns true for Hydra itself', () => {
    expect(isProtectedProcess('Electron')).toBe(true)
    expect(isProtectedProcess('HYDRA')).toBe(true)
    expect(isProtectedProcess('hydra')).toBe(true)
  })

  it('returns false for normal processes', () => {
    expect(isProtectedProcess('node')).toBe(false)
    expect(isProtectedProcess('postgres')).toBe(false)
    expect(isProtectedProcess('python3')).toBe(false)
  })

  it('matches case-insensitively', () => {
    expect(isProtectedProcess('finder')).toBe(true)
    expect(isProtectedProcess('WINDOWSERVER')).toBe(true)
  })
})

describe('validatePid', () => {
  it('returns false for PID 0 or negative', () => {
    expect(validatePid(0)).toBe(false)
    expect(validatePid(-1)).toBe(false)
  })

  it('returns false for PID 1 (init/launchd)', () => {
    expect(validatePid(1)).toBe(false)
  })

  it('returns true for normal PIDs', () => {
    expect(validatePid(1234)).toBe(true)
    expect(validatePid(99999)).toBe(true)
  })
})

describe('PROTECTED_PROCESSES', () => {
  it('contains critical system processes', () => {
    const names = PROTECTED_PROCESSES.map((n) => n.toLowerCase())
    expect(names).toContain('finder')
    expect(names).toContain('windowserver')
    expect(names).toContain('loginwindow')
    expect(names).toContain('kernel_task')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/actions.test.ts 2>&1`
Expected: FAIL — module `./actions` not found

**Step 3: Implement the action handlers**

Create `src/main/actions.ts`:

```typescript
import { execFile } from 'child_process'
import { promisify } from 'util'
import type {
  ProcessSignalType,
  ProcessActionResult,
  GroupActionResult,
  ProcessInfo
} from '../shared/types'

const execFileAsync = promisify(execFile)

export const PROTECTED_PROCESSES = [
  'Finder',
  'WindowServer',
  'loginwindow',
  'kernel_task',
  'launchd',
  'systemd',
  'Electron',
  'HYDRA',
  'hydra'
]

export function isProtectedProcess(name: string): boolean {
  return PROTECTED_PROCESSES.some((p) => p.toLowerCase() === name.toLowerCase())
}

export function validatePid(pid: number): boolean {
  return pid > 1 && Number.isInteger(pid)
}

/**
 * Verify a PID still exists and optionally matches an expected process name.
 * Uses execFile (not exec) with sanitized PID to prevent injection.
 * Returns the actual process name if alive, null if dead.
 */
async function verifyPidAlive(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'comm='], {
      timeout: 3000
    })
    const name = stdout.trim()
    return name || null
  } catch {
    return null
  }
}

/**
 * Send a signal to a single process.
 * Validates PID, checks protected list, verifies process is alive.
 */
export async function sendProcessSignal(
  pid: number,
  signal: ProcessSignalType,
  expectedName?: string
): Promise<ProcessActionResult> {
  if (!validatePid(pid)) {
    return { success: false, pid, signal, error: `Invalid PID: ${pid}` }
  }

  // Verify process is alive
  const actualName = await verifyPidAlive(pid)
  if (!actualName) {
    return { success: false, pid, signal, error: `PID ${pid} is no longer running` }
  }

  // Check protected list
  if (isProtectedProcess(actualName)) {
    return {
      success: false,
      pid,
      signal,
      error: `${actualName} (PID ${pid}) is a protected process`
    }
  }

  // Optional name verification to prevent PID recycling issues
  if (expectedName && actualName.toLowerCase() !== expectedName.toLowerCase()) {
    return {
      success: false,
      pid,
      signal,
      error: `PID ${pid} is now ${actualName}, expected ${expectedName} (PID was recycled)`
    }
  }

  try {
    process.kill(pid, signal)
    return { success: true, pid, signal }
  } catch (err) {
    return {
      success: false,
      pid,
      signal,
      error: `Failed to send ${signal} to PID ${pid}: ${err instanceof Error ? err.message : 'Unknown error'}`
    }
  }
}

/**
 * Kill a process: SIGTERM first, then SIGKILL after timeout if still alive.
 */
export async function killProcess(
  pid: number,
  expectedName?: string,
  forceTimeoutMs = 5000
): Promise<ProcessActionResult> {
  const termResult = await sendProcessSignal(pid, 'SIGTERM', expectedName)
  if (!termResult.success) return termResult

  // Wait and check if process died
  await new Promise((resolve) => setTimeout(resolve, Math.min(forceTimeoutMs, 5000)))

  const stillAlive = await verifyPidAlive(pid)
  if (stillAlive) {
    return sendProcessSignal(pid, 'SIGKILL')
  }

  return termResult
}

/**
 * Kill all processes in a group.
 */
export async function killGroup(
  processes: ProcessInfo[],
  groupName: string
): Promise<GroupActionResult> {
  const results = await Promise.all(processes.map((p) => killProcess(p.pid, p.name)))

  return {
    results,
    groupName,
    totalKilled: results.filter((r) => r.success).length,
    totalFailed: results.filter((r) => !r.success).length
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/actions.test.ts 2>&1`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/main/actions.ts src/main/actions.test.ts
git commit -m "feat(actions): process kill/freeze/thaw handlers with PID validation and protected process list"
```

---

### Task 1.3: Wire IPC channels through preload and main

**Files:**

- Modify: `src/preload/index.ts` (add 3 new bridge methods)
- Modify: `src/main/monitors/index.ts` (register 3 new IPC handlers + cleanup)

**Step 1: Add preload bridge methods**

In `src/preload/index.ts`, add these imports to the existing type import block (line 3-17):

```typescript
import type {
  // ... existing imports ...
  ProcessSignalType,
  ProcessActionResult,
  GroupActionResult
} from '../shared/types'
```

Add these methods to the `api` object (before the closing `}` on line ~146):

```typescript
  killProcess: (pid: number, expectedName?: string): Promise<ProcessActionResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROCESS_KILL, pid, expectedName),

  signalProcess: (pid: number, signal: ProcessSignalType): Promise<ProcessActionResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROCESS_SIGNAL, pid, signal),

  killGroup: (pids: { pid: number; name: string }[], groupName: string): Promise<GroupActionResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROCESS_KILL_GROUP, pids, groupName),
```

**Step 2: Register IPC handlers in the monitor orchestrator**

In `src/main/monitors/index.ts`, add import at top (after line 19):

```typescript
import { killProcess, sendProcessSignal, killGroup } from '../actions'
import type { ProcessSignalType } from '../../shared/types'
```

Inside `startMonitoring()`, add after the `SECURITY_SCAN_REQUEST` handler block (after line ~286):

```typescript
ipcMain.handle(IPC_CHANNELS.PROCESS_KILL, async (_event, pid: number, expectedName?: string) => {
  return killProcess(pid, expectedName)
})

ipcMain.handle(
  IPC_CHANNELS.PROCESS_SIGNAL,
  async (_event, pid: number, signal: ProcessSignalType) => {
    return sendProcessSignal(pid, signal)
  }
)

ipcMain.handle(
  IPC_CHANNELS.PROCESS_KILL_GROUP,
  async (_event, processes: { pid: number; name: string }[], groupName: string) => {
    return killGroup(
      processes.map((p) => ({ ...p, user: '', cpu: 0, mem: 0, command: '' })),
      groupName
    )
  }
)
```

Inside `stopMonitoring()`, add cleanup (after line ~302, with the other `removeHandler` calls):

```typescript
ipcMain.removeHandler(IPC_CHANNELS.PROCESS_KILL)
ipcMain.removeHandler(IPC_CHANNELS.PROCESS_SIGNAL)
ipcMain.removeHandler(IPC_CHANNELS.PROCESS_KILL_GROUP)
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No new errors

**Step 4: Run full test suite**

Run: `npx vitest --run 2>&1 | tail -10`
Expected: actions.test.ts passes, no regressions in existing tests

**Step 5: Commit**

```bash
git add src/preload/index.ts src/main/monitors/index.ts
git commit -m "feat(ipc): wire process kill/signal/kill-group through preload bridge and main handlers"
```

---

### Task 1.4: Add action methods to system store

**Files:**

- Modify: `src/renderer/src/stores/system.ts`

**Step 1: Add action methods to the system store**

Replace the entire file `src/renderer/src/stores/system.ts`:

```typescript
import { create } from 'zustand'
import type {
  SystemState,
  ProcessSignalType,
  ProcessActionResult,
  GroupActionResult
} from '../../../shared/types'
import { useTimeSeriesStore } from './timeseries'

interface SystemStore {
  state: SystemState | null
  isConnected: boolean
  frozenPids: Set<number>
  initialize: () => Promise<void>
  refresh: () => void
  killProcess: (pid: number, expectedName?: string) => Promise<ProcessActionResult>
  signalProcess: (pid: number, signal: ProcessSignalType) => Promise<ProcessActionResult>
  killGroup: (
    processes: { pid: number; name: string }[],
    groupName: string
  ) => Promise<GroupActionResult>
}

export const useSystemStore = create<SystemStore>((set, get) => ({
  state: null,
  isConnected: false,
  frozenPids: new Set<number>(),

  initialize: async () => {
    try {
      const initialState = await window.hydra.getInitialState()
      set({ state: initialState, isConnected: true })

      window.hydra.onSystemStateUpdate((newState) => {
        set({ state: newState })

        const netIn = newState.network?.totalBytesInPerSec ?? 0
        const netOut = newState.network?.totalBytesOutPerSec ?? 0
        useTimeSeriesStore
          .getState()
          .push(newState.cpu.usage, newState.memory.usagePercent, netIn, netOut)
      })
    } catch (err) {
      console.error('Failed to initialize system store:', err)
      set({ isConnected: false })
    }
  },

  refresh: () => {
    window.hydra.requestRefresh()
  },

  killProcess: async (pid, expectedName) => {
    const result = await window.hydra.killProcess(pid, expectedName)
    if (result.success) {
      set((s) => {
        const next = new Set(s.frozenPids)
        next.delete(pid)
        return { frozenPids: next }
      })
    }
    return result
  },

  signalProcess: async (pid, signal) => {
    const result = await window.hydra.signalProcess(pid, signal)
    if (result.success) {
      set((s) => {
        const next = new Set(s.frozenPids)
        if (signal === 'SIGSTOP') next.add(pid)
        if (signal === 'SIGCONT') next.delete(pid)
        return { frozenPids: next }
      })
    }
    return result
  },

  killGroup: async (processes, groupName) => {
    const result = await window.hydra.killGroup(processes, groupName)
    set((s) => {
      const next = new Set(s.frozenPids)
      for (const r of result.results) {
        if (r.success) next.delete(r.pid)
      }
      return { frozenPids: next }
    })
    return result
  }
}))
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -30`
Expected: No new errors. If there are type errors about `window.hydra.killProcess` etc., we need to update the global type declaration.

**Step 3: Commit**

```bash
git add src/renderer/src/stores/system.ts
git commit -m "feat(store): add kill/signal/killGroup action methods and frozenPids tracking to system store"
```

---

## Phase 2: Command Center Panel

### Task 2.1: Create the Command Center panel

**Files:**

- Create: `src/renderer/src/panels/CommandCenter.tsx`

**Step 1: Create the Command Center panel**

Create `src/renderer/src/panels/CommandCenter.tsx`:

```typescript
import { useState } from 'react'
import { useSystemStore } from '../stores/system'
import type { ProcessGroup, ProcessInfo } from '../../../../shared/types'

const TYPE_LABELS: Record<ProcessGroup['type'], string> = {
  project: 'PRJ',
  agent: 'AI',
  service: 'SVC',
  other: 'SYS'
}

const TYPE_PILL_STYLES: Record<ProcessGroup['type'], string> = {
  project: 'bg-blue-950/60 text-blue-400 border-blue-800/40',
  agent: 'bg-amber-950/60 text-amber-400 border-amber-800/40',
  service: 'bg-green-950/60 text-green-400 border-green-800/40',
  other: 'bg-gray-900 text-gray-500 border-gray-700/40'
}

const HEALTH_DOT: Record<string, string> = {
  green: 'bg-green-400 shadow-green-400/50',
  yellow: 'bg-amber-400 shadow-amber-400/50',
  red: 'bg-red-400 shadow-red-400/50'
}

function getGroupHealth(group: ProcessGroup): 'green' | 'yellow' | 'red' {
  if (group.totalCpu > 95) return 'red'
  if (group.totalCpu > 80) return 'yellow'
  if (group.totalMem > 85) return 'red'
  if (group.totalMem > 70) return 'yellow'
  return 'green'
}

export function CommandCenterPanel(): JSX.Element {
  const state = useSystemStore((s) => s.state)
  const frozenPids = useSystemStore((s) => s.frozenPids)

  if (!state) return <></>

  const groups = [...state.processes]
    .filter((g) => g.type !== 'other')
    .sort((a, b) => {
      const healthOrder = { red: 0, yellow: 1, green: 2 }
      const ha = healthOrder[getGroupHealth(a)]
      const hb = healthOrder[getGroupHealth(b)]
      if (ha !== hb) return ha - hb
      return b.totalCpu - a.totalCpu
    })

  const otherCount = state.processes
    .filter((g) => g.type === 'other')
    .reduce((sum, g) => sum + g.processes.length, 0)

  const repoMap = new Map(state.gitRepos.map((r) => [r.name, r]))

  return (
    <div className="space-y-0.5 text-sm overflow-y-auto max-h-full">
      <div className="flex items-center text-[10px] text-gray-600 uppercase tracking-wider px-2 pb-1.5 mb-1 border-b border-gray-800/50">
        <span className="w-4" />
        <span className="flex-1">Workspace</span>
        <span className="w-10 text-center">Type</span>
        <span className="w-20 text-right">Ports</span>
        <span className="w-14 text-right">CPU</span>
        <span className="w-14 text-right">MEM</span>
        <span className="w-20 text-right">Git</span>
        <span className="w-20 text-right">Actions</span>
      </div>
      {groups.map((group) => (
        <CommandRow
          key={`${group.type}:${group.name}`}
          group={group}
          repo={repoMap.get(group.name)}
          frozenPids={frozenPids}
        />
      ))}
      {otherCount > 0 && (
        <div className="text-xs text-gray-600 pt-2 px-2">
          + {otherCount} system processes
        </div>
      )}
      {groups.length === 0 && (
        <div className="text-gray-600 text-xs">No active workspaces</div>
      )}
    </div>
  )
}

function CommandRow({
  group,
  repo,
  frozenPids
}: {
  group: ProcessGroup
  repo?: { branch: string; dirty: boolean; ahead: number; status: string }
  frozenPids: Set<number>
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const killGroup = useSystemStore((s) => s.killGroup)
  const signalProcess = useSystemStore((s) => s.signalProcess)

  const health = getGroupHealth(group)
  const frozenCount = group.processes.filter((p) => frozenPids.has(p.pid)).length
  const allFrozen = frozenCount === group.processes.length && frozenCount > 0

  const handleFreezeAll = async (): Promise<void> => {
    for (const p of group.processes) {
      if (!frozenPids.has(p.pid)) {
        await signalProcess(p.pid, 'SIGSTOP')
      }
    }
  }

  const handleThawAll = async (): Promise<void> => {
    for (const p of group.processes) {
      if (frozenPids.has(p.pid)) {
        await signalProcess(p.pid, 'SIGCONT')
      }
    }
  }

  const handleKillGroup = async (): Promise<void> => {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 3000)
      return
    }
    setConfirming(false)
    await killGroup(
      group.processes.map((p) => ({ pid: p.pid, name: p.name })),
      group.name
    )
  }

  return (
    <div>
      <div className="flex items-center py-1.5 px-2 rounded cursor-pointer transition-colors hover:bg-gray-800/50 border border-transparent">
        <div className="w-4 flex items-center">
          <span className={`w-2 h-2 rounded-full shadow-sm ${HEALTH_DOT[health]}`} />
        </div>

        <div
          className="flex items-center gap-2 flex-1 min-w-0"
          onClick={() => setExpanded(!expanded)}
        >
          <span
            className={`text-[10px] ${expanded ? 'rotate-90' : ''} text-gray-500 transition-transform`}
          >
            ▶
          </span>
          <span className="text-white truncate">{group.name}</span>
          {frozenCount > 0 && (
            <span className="text-blue-400 text-[10px]" title={`${frozenCount} frozen`}>
              * {frozenCount}
            </span>
          )}
        </div>

        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border w-10 text-center ${TYPE_PILL_STYLES[group.type]}`}
        >
          {TYPE_LABELS[group.type]}
        </span>

        <span className="text-gray-500 text-xs font-mono w-20 text-right truncate">
          {group.ports.length > 0
            ? group.ports.map((p) => `:${p}`).join(' ')
            : '\u2014'}
        </span>

        <div className="flex items-center gap-1 w-14 justify-end">
          <span className="text-blue-400 text-xs font-mono">
            {group.totalCpu.toFixed(1)}%
          </span>
        </div>

        <span className="text-purple-400 text-xs font-mono w-14 text-right">
          {group.totalMem.toFixed(1)}%
        </span>

        <span className="text-xs w-20 text-right truncate">
          {repo ? (
            <>
              <span className="text-gray-400">{repo.branch}</span>
              {repo.dirty && <span className="text-amber-400 ml-1">*</span>}
              {repo.ahead > 0 && (
                <span className="text-cyan-400 ml-1">{'\u2191'}{repo.ahead}</span>
              )}
            </>
          ) : (
            <span className="text-gray-700">{'\u2014'}</span>
          )}
        </span>

        <div className="flex items-center gap-1 w-20 justify-end">
          {allFrozen ? (
            <button
              onClick={(e) => { e.stopPropagation(); handleThawAll() }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-400 border border-blue-800/40 hover:bg-blue-900/60"
              title="Thaw all processes"
            >
              Thaw
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); handleFreezeAll() }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-400 border border-cyan-800/40 hover:bg-cyan-900/60"
              title="Freeze all processes (SIGSTOP)"
            >
              Freeze
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleKillGroup() }}
            className={`text-[10px] px-1.5 py-0.5 rounded border ${
              confirming
                ? 'bg-red-900/60 text-red-300 border-red-500 animate-pulse'
                : 'bg-red-950/60 text-red-400 border-red-800/40 hover:bg-red-900/60'
            }`}
            title={confirming ? 'Click again to confirm' : `Kill all ${group.processes.length} processes`}
          >
            {confirming ? 'Sure?' : 'Kill'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="ml-6 border-l border-gray-800 pl-2 py-1 space-y-px">
          <div className="flex items-center text-[10px] text-gray-600 uppercase tracking-wider px-1 pb-1 gap-2">
            <span className="w-3" />
            <span className="flex-1">Process</span>
            <span className="w-10 text-right">CPU</span>
            <span className="w-10 text-right">MEM</span>
            <span className="w-14 text-right">PID</span>
            <span className="w-20 text-right">Actions</span>
          </div>
          {[...group.processes]
            .sort((a, b) => b.cpu - a.cpu)
            .map((proc, idx) => (
              <ProcessActionRow
                key={proc.pid}
                proc={proc}
                isEven={idx % 2 === 0}
                isFrozen={frozenPids.has(proc.pid)}
              />
            ))}
        </div>
      )}
    </div>
  )
}

function ProcessActionRow({
  proc,
  isEven,
  isFrozen
}: {
  proc: ProcessInfo
  isEven: boolean
  isFrozen: boolean
}): JSX.Element {
  const killProcess = useSystemStore((s) => s.killProcess)
  const signalProcess = useSystemStore((s) => s.signalProcess)

  const cpuColor =
    proc.cpu > 50 ? 'text-red-400' : proc.cpu > 20 ? 'text-amber-400' : 'text-gray-400'
  const memColor =
    proc.mem > 10 ? 'text-red-400' : proc.mem > 5 ? 'text-amber-400' : 'text-gray-400'

  const shortCommand = proc.command
    .replace(/^\/.*\//, '')
    .replace(/\s+--?\S+=\S+/g, '')
    .slice(0, 50)

  return (
    <div
      className={`flex items-center text-xs px-1 py-0.5 rounded hover:bg-gray-800/30 gap-2 ${isEven ? 'bg-gray-900/30' : ''}`}
    >
      <span className="w-3 text-center">
        {isFrozen && <span className="text-blue-400 text-[10px]" title="Frozen">*</span>}
      </span>

      <span className="text-gray-400 truncate flex-1" title={proc.command}>
        {shortCommand}
      </span>
      <span className={`${cpuColor} font-mono w-10 text-right shrink-0`}>
        {proc.cpu.toFixed(1)}
      </span>
      <span className={`${memColor} font-mono w-10 text-right shrink-0`}>
        {proc.mem.toFixed(1)}
      </span>
      <span className="text-gray-700 font-mono w-14 text-right shrink-0">{proc.pid}</span>

      <div className="flex items-center gap-1 w-20 justify-end">
        {isFrozen ? (
          <button
            onClick={() => signalProcess(proc.pid, 'SIGCONT')}
            className="text-[10px] px-1 py-0.5 rounded bg-blue-950/60 text-blue-400 border border-blue-800/40 hover:bg-blue-900/60"
            title="Thaw (SIGCONT)"
          >
            Thaw
          </button>
        ) : (
          <button
            onClick={() => signalProcess(proc.pid, 'SIGSTOP')}
            className="text-[10px] px-1 py-0.5 rounded bg-cyan-950/60 text-cyan-400 border border-cyan-800/40 hover:bg-cyan-900/60"
            title="Freeze (SIGSTOP)"
          >
            Freeze
          </button>
        )}
        <button
          onClick={() => killProcess(proc.pid, proc.name)}
          className="text-[10px] px-1 py-0.5 rounded bg-red-950/60 text-red-400 border-red-800/40 border hover:bg-red-900/60"
          title="Kill (SIGTERM)"
        >
          Kill
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Verify the file compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -30`
Expected: No errors from CommandCenter.tsx

**Step 3: Commit**

```bash
git add src/renderer/src/panels/CommandCenter.tsx
git commit -m "feat(ui): add Command Center panel with unified workspace view and kill/freeze/thaw actions"
```

---

### Task 2.2: Wire Command Center into App layout

**Files:**

- Modify: `src/renderer/src/App.tsx`

**Step 1: Add import and panel config**

In `src/renderer/src/App.tsx`:

Add import (after line 14):

```typescript
import { CommandCenterPanel } from './panels/CommandCenter'
```

Add to `PANEL_DOTS` (after line 17):

```typescript
  'Command Center': 'bg-emerald-400',
```

Add to `PANEL_ACCENT_HEX` (after line 31):

```typescript
  'Command Center': '#34d399',
```

**Step 2: Add Command Center as the first panel in Row 2**

Replace the Row 2 comment block (lines 233-242) with:

```tsx
        {/* Row 2: Command Center (spans 2 cols), Git Status */}
        <Panel title="Command Center" className="col-span-2 row-span-2">
          <CommandCenterPanel />
        </Panel>
        <Panel title="Git Status">
          <GitStatusPanel />
        </Panel>

        {/* Row 3: Agents */}
        <Panel title="Agents">
          <AgentsPanel />
        </Panel>
```

This gives Command Center a 2-column, 2-row space (the dominant panel), with Git Status and Agents alongside it.

**Step 3: Verify build compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(layout): wire Command Center panel into dashboard as primary 2x2 panel"
```

---

## Phase 3: Health Scoring

### Task 3.1: Implement health scoring pure function

**Files:**

- Create: `src/main/health.ts`
- Test: `src/main/health.test.ts`

**Step 1: Write failing tests**

Create `src/main/health.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { scoreWorkspace, scoreSystem } from './health'
import type { ProcessGroup, GitRepoInfo } from '../shared/types'

function makeGroup(overrides: Partial<ProcessGroup> = {}): ProcessGroup {
  return {
    name: 'test-app',
    type: 'project',
    processes: [],
    totalCpu: 10,
    totalMem: 20,
    ports: [3000],
    ...overrides
  }
}

function makeRepo(overrides: Partial<GitRepoInfo> = {}): GitRepoInfo {
  return {
    path: '/test',
    name: 'test-app',
    branch: 'main',
    dirty: false,
    untracked: 0,
    modified: 0,
    ahead: 0,
    behind: 0,
    status: 'clean',
    ...overrides
  }
}

describe('scoreWorkspace', () => {
  it('returns green for healthy workspace', () => {
    const result = scoreWorkspace(makeGroup(), undefined, new Set())
    expect(result.level).toBe('green')
    expect(result.reasons).toHaveLength(0)
  })

  it('returns yellow for CPU > 80%', () => {
    const result = scoreWorkspace(makeGroup({ totalCpu: 85 }), undefined, new Set())
    expect(result.level).toBe('yellow')
    expect(result.reasons).toContain('CPU > 80%')
  })

  it('returns red for CPU > 95%', () => {
    const result = scoreWorkspace(makeGroup({ totalCpu: 97 }), undefined, new Set())
    expect(result.level).toBe('red')
    expect(result.reasons).toContain('CPU > 95%')
  })

  it('returns yellow for memory > 70%', () => {
    const result = scoreWorkspace(makeGroup({ totalMem: 75 }), undefined, new Set())
    expect(result.level).toBe('yellow')
    expect(result.reasons).toContain('Memory > 70%')
  })

  it('returns red for memory > 85%', () => {
    const result = scoreWorkspace(makeGroup({ totalMem: 90 }), undefined, new Set())
    expect(result.level).toBe('red')
    expect(result.reasons).toContain('Memory > 85%')
  })

  it('returns yellow for dirty git with many unpushed commits', () => {
    const repo = makeRepo({ dirty: true, ahead: 12 })
    const result = scoreWorkspace(makeGroup(), repo, new Set())
    expect(result.level).toBe('yellow')
    expect(result.reasons.some((r) => r.includes('ahead'))).toBe(true)
  })

  it('returns yellow when all processes are frozen', () => {
    const group = makeGroup({
      processes: [
        { pid: 100, user: 'test', cpu: 0, mem: 1, command: 'node', name: 'node' },
        { pid: 101, user: 'test', cpu: 0, mem: 1, command: 'node', name: 'node' }
      ]
    })
    const result = scoreWorkspace(group, undefined, new Set([100, 101]))
    expect(result.level).toBe('yellow')
    expect(result.reasons.some((r) => r.includes('frozen'))).toBe(true)
  })

  it('worst condition wins (red > yellow)', () => {
    const result = scoreWorkspace(makeGroup({ totalCpu: 97, totalMem: 75 }), undefined, new Set())
    expect(result.level).toBe('red')
  })
})

describe('scoreSystem', () => {
  it('returns green when all workspaces are green', () => {
    const groups = [makeGroup(), makeGroup({ name: 'other-app' })]
    const result = scoreSystem(groups, [], new Set())
    expect(result.overall).toBe('green')
  })

  it('returns red if any workspace is red', () => {
    const groups = [makeGroup(), makeGroup({ name: 'hot-app', totalCpu: 97 })]
    const result = scoreSystem(groups, [], new Set())
    expect(result.overall).toBe('red')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/health.test.ts 2>&1`
Expected: FAIL - module `./health` not found

**Step 3: Implement health scoring**

Create `src/main/health.ts`:

```typescript
import type { ProcessGroup, GitRepoInfo } from '../shared/types'

export type HealthLevel = 'green' | 'yellow' | 'red'

export interface WorkspaceHealth {
  name: string
  level: HealthLevel
  reasons: string[]
}

export interface SystemHealth {
  overall: HealthLevel
  workspaces: WorkspaceHealth[]
}

const LEVEL_PRIORITY: Record<HealthLevel, number> = { green: 0, yellow: 1, red: 2 }

function worst(a: HealthLevel, b: HealthLevel): HealthLevel {
  return LEVEL_PRIORITY[a] >= LEVEL_PRIORITY[b] ? a : b
}

export function scoreWorkspace(
  group: ProcessGroup,
  repo: GitRepoInfo | undefined,
  frozenPids: Set<number>
): WorkspaceHealth {
  let level: HealthLevel = 'green'
  const reasons: string[] = []

  if (group.totalCpu > 95) {
    level = worst(level, 'red')
    reasons.push('CPU > 95%')
  } else if (group.totalCpu > 80) {
    level = worst(level, 'yellow')
    reasons.push('CPU > 80%')
  }

  if (group.totalMem > 85) {
    level = worst(level, 'red')
    reasons.push('Memory > 85%')
  } else if (group.totalMem > 70) {
    level = worst(level, 'yellow')
    reasons.push('Memory > 70%')
  }

  if (repo && repo.dirty && repo.ahead > 10) {
    level = worst(level, 'yellow')
    reasons.push(`${repo.ahead} commits ahead, dirty`)
  }

  if (group.processes.length > 0) {
    const frozenCount = group.processes.filter((p) => frozenPids.has(p.pid)).length
    if (frozenCount === group.processes.length) {
      level = worst(level, 'yellow')
      reasons.push('All processes frozen')
    }
  }

  return { name: group.name, level, reasons }
}

export function scoreSystem(
  groups: ProcessGroup[],
  repos: GitRepoInfo[],
  frozenPids: Set<number>
): SystemHealth {
  const repoMap = new Map(repos.map((r) => [r.name, r]))

  const workspaces = groups
    .filter((g) => g.type !== 'other')
    .map((g) => scoreWorkspace(g, repoMap.get(g.name), frozenPids))

  let overall: HealthLevel = 'green'
  for (const w of workspaces) {
    overall = worst(overall, w.level)
  }

  return { overall, workspaces }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/health.test.ts 2>&1`
Expected: All tests PASS

**Step 5: Run full suite for regressions**

Run: `npx vitest --run 2>&1 | tail -5`
Expected: No new failures

**Step 6: Commit**

```bash
git add src/main/health.ts src/main/health.test.ts
git commit -m "feat(health): pure health scoring function for workspaces with CPU/mem/git/frozen thresholds"
```

---

### Task 3.2: Enrich briefing prompt with health scores

**Files:**

- Modify: `src/main/intelligence/briefing.ts`

**Step 1: Add health section to the briefing prompt builder**

In `src/main/intelligence/briefing.ts`, add import at top:

```typescript
import { scoreSystem } from '../health'
```

In `buildBriefingPrompt()`, add a new section at the end of the function, before `return sections.join('\n\n')`:

```typescript
// Health scoring
const healthResult = scoreSystem(state.processes, state.gitRepos, new Set())
const unhealthy = healthResult.workspaces.filter((w) => w.level !== 'green')
if (unhealthy.length > 0) {
  const healthLines = unhealthy.map(
    (w) => `- ${w.name}: ${w.level.toUpperCase()} \u2014 ${w.reasons.join(', ')}`
  )
  sections.push(`## Health Alerts\n${healthLines.join('\n')}`)
}
```

**Step 2: Run briefing tests**

Run: `npx vitest run src/main/intelligence/briefing.test.ts 2>&1`
Expected: All existing tests pass (the new section is additive)

**Step 3: Commit**

```bash
git add src/main/intelligence/briefing.ts
git commit -m "feat(briefing): enrich AI briefing prompt with workspace health scores"
```

---

## Phase 4: Session Persistence + Timeline

### Task 4.1: Add new DB tables

**Files:**

- Modify: `src/main/db/schema.ts`
- Modify: `src/main/db/queries.ts`

**Step 1: Add session and timeline tables to schema**

In `src/main/db/schema.ts`, add after the `CREATE_POSTURE_HISTORY_TABLE` const (before `initializeSchema`):

```typescript
export const CREATE_SESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  data TEXT NOT NULL
)`

export const CREATE_TIMELINE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS timeline_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT
)`
```

Add to `initializeSchema()`:

```typescript
db.exec(CREATE_SESSIONS_TABLE)
db.exec(CREATE_TIMELINE_EVENTS_TABLE)
```

**Step 2: Add query functions**

In `src/main/db/queries.ts`, add these new types and functions at the end of the file:

```typescript
export interface SessionSnapshot {
  id: number
  timestamp: number
  data: {
    workspaces: { name: string; type: string; ports: number[]; processCount: number }[]
    gitBranches: { repo: string; branch: string }[]
    frozenPids: number[]
  }
}

export interface TimelineEvent {
  id?: number
  timestamp: number
  type: 'process_start' | 'process_stop' | 'user_action' | 'auto_heal' | 'system'
  source: string
  message: string
  metadata?: string
}

export function insertSession(snapshot: SessionSnapshot['data']): void {
  const db = getDb()
  db.prepare('INSERT INTO sessions (timestamp, data) VALUES (?, ?)').run(
    Date.now(),
    JSON.stringify(snapshot)
  )
}

export function getLatestSession(): SessionSnapshot | null {
  const db = getDb()
  const row = db
    .prepare('SELECT id, timestamp, data FROM sessions ORDER BY timestamp DESC LIMIT 1')
    .get() as { id: number; timestamp: number; data: string } | undefined
  if (!row) return null
  return { id: row.id, timestamp: row.timestamp, data: JSON.parse(row.data) }
}

export function insertTimelineEvent(event: Omit<TimelineEvent, 'id'>): void {
  const db = getDb()
  db.prepare(
    'INSERT INTO timeline_events (timestamp, type, source, message, metadata) VALUES (?, ?, ?, ?, ?)'
  ).run(event.timestamp, event.type, event.source, event.message, event.metadata ?? null)
}

export function getTimelineEvents(limit: number): TimelineEvent[] {
  const db = getDb()
  return db
    .prepare(
      'SELECT id, timestamp, type, source, message, metadata FROM timeline_events ORDER BY timestamp DESC LIMIT ?'
    )
    .all(limit) as TimelineEvent[]
}

export function pruneOldTimelineEvents(maxAgeDays = 7): void {
  const db = getDb()
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  db.prepare('DELETE FROM timeline_events WHERE timestamp < ?').run(cutoff)
}
```

**Step 3: Verify compile**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add src/main/db/schema.ts src/main/db/queries.ts
git commit -m "feat(db): add sessions and timeline_events tables with CRUD queries"
```

---

### Task 4.2: Add session snapshot + timeline event generation to monitor loop

**Files:**

- Modify: `src/main/monitors/index.ts`
- Modify: `src/shared/types.ts` (new IPC channels)
- Modify: `src/preload/index.ts` (new bridge methods)

**Step 1: Add new IPC channels to types.ts**

In `src/shared/types.ts`, add to `IPC_CHANNELS` (before `} as const`):

```typescript
  TIMELINE_EVENTS: 'timeline:events',
  SESSION_DELTA: 'session:delta',
```

**Step 2: Add session + timeline logic to monitor loop**

In `src/main/monitors/index.ts`, add imports:

```typescript
import {
  insertSession,
  getLatestSession,
  insertTimelineEvent,
  getTimelineEvents,
  pruneOldTimelineEvents
} from '../db/queries'
```

Add module-level variables (after `snapshotPollCount` on line ~80):

```typescript
let sessionPollCount = 0
let previousWorkspaceNames = new Set<string>()
```

Inside the `setInterval` callback in `startMonitoring()`, after the snapshot persistence block (~line 223), add:

```typescript
// Session snapshot (every 150th cycle = ~5 min)
sessionPollCount++
if (sessionPollCount >= 150) {
  sessionPollCount = 0
  try {
    const sessionData = {
      workspaces: latestState.processes
        .filter((g) => g.type !== 'other')
        .map((g) => ({
          name: g.name,
          type: g.type,
          ports: g.ports,
          processCount: g.processes.length
        })),
      gitBranches: latestState.gitRepos.map((r) => ({
        repo: r.name,
        branch: r.branch
      })),
      frozenPids: [] as number[]
    }
    insertSession(sessionData)
  } catch (err) {
    console.error('Session snapshot failed:', err)
  }

  // Prune old timeline events
  try {
    pruneOldTimelineEvents(7)
  } catch {
    /* ignore */
  }
}

// Timeline: detect workspace appear/disappear
const currentNames = new Set(
  latestState.processes.filter((g) => g.type !== 'other').map((g) => g.name)
)
if (previousWorkspaceNames.size > 0) {
  for (const name of currentNames) {
    if (!previousWorkspaceNames.has(name)) {
      const group = latestState.processes.find((g) => g.name === name)
      const ports = group?.ports.map((p) => `:${p}`).join(', ') || ''
      try {
        insertTimelineEvent({
          timestamp: Date.now(),
          type: 'process_start',
          source: name,
          message: `${name} started${ports ? ` on ${ports}` : ''}`
        })
      } catch {
        /* ignore */
      }
    }
  }
  for (const name of previousWorkspaceNames) {
    if (!currentNames.has(name)) {
      try {
        insertTimelineEvent({
          timestamp: Date.now(),
          type: 'process_stop',
          source: name,
          message: `${name} stopped`
        })
      } catch {
        /* ignore */
      }
    }
  }
}
previousWorkspaceNames = currentNames
```

Add new IPC handlers inside `startMonitoring()` (after the process action handlers):

```typescript
ipcMain.handle(IPC_CHANNELS.TIMELINE_EVENTS, async (_event, limit: number) => {
  return getTimelineEvents(limit)
})

ipcMain.handle(IPC_CHANNELS.SESSION_DELTA, async () => {
  const lastSession = getLatestSession()
  if (!lastSession || !latestState) return null

  const currentNames = new Set(
    latestState.processes.filter((g) => g.type !== 'other').map((g) => g.name)
  )
  const missing = lastSession.data.workspaces.filter((w) => !currentNames.has(w.name))
  if (missing.length === 0) return null

  return {
    lastSessionTimestamp: lastSession.timestamp,
    missingWorkspaces: missing
  }
})
```

Add cleanup in `stopMonitoring()`:

```typescript
ipcMain.removeHandler(IPC_CHANNELS.TIMELINE_EVENTS)
ipcMain.removeHandler(IPC_CHANNELS.SESSION_DELTA)
sessionPollCount = 0
previousWorkspaceNames = new Set()
```

**Step 3: Add preload bridge methods**

In `src/preload/index.ts`, add to the `api` object:

```typescript
  getTimelineEvents: (limit: number): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.TIMELINE_EVENTS, limit),

  getSessionDelta: (): Promise<{ lastSessionTimestamp: number; missingWorkspaces: { name: string; type: string; ports: number[] }[] } | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_DELTA),
```

**Step 4: Verify compile + tests**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Run: `npx vitest --run 2>&1 | tail -5`
Expected: No new errors or failures

**Step 5: Commit**

```bash
git add src/shared/types.ts src/main/monitors/index.ts src/preload/index.ts
git commit -m "feat(sessions): session snapshots every 5min, timeline event generation for workspace appear/disappear"
```

---

### Task 4.3: Create Timeline panel

**Files:**

- Create: `src/renderer/src/panels/Timeline.tsx`
- Modify: `src/renderer/src/App.tsx`

**Step 1: Create Timeline panel**

Create `src/renderer/src/panels/Timeline.tsx`:

```typescript
import { useEffect, useState } from 'react'

interface TimelineEvent {
  id: number
  timestamp: number
  type: 'process_start' | 'process_stop' | 'user_action' | 'auto_heal' | 'system'
  source: string
  message: string
}

const TYPE_ICONS: Record<TimelineEvent['type'], string> = {
  process_start: '>',
  process_stop: 'x',
  user_action: '!',
  auto_heal: '~',
  system: 'o'
}

const TYPE_COLORS: Record<TimelineEvent['type'], string> = {
  process_start: 'text-green-400',
  process_stop: 'text-red-400',
  user_action: 'text-cyan-400',
  auto_heal: 'text-amber-400',
  system: 'text-gray-400'
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export function SessionDeltaBanner(): JSX.Element {
  const [delta, setDelta] = useState<{
    lastSessionTimestamp: number
    missingWorkspaces: { name: string; type: string; ports: number[] }[]
  } | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    window.hydra.getSessionDelta().then((d: typeof delta) => setDelta(d))
  }, [])

  if (!delta || dismissed || delta.missingWorkspaces.length === 0) return <></>

  return (
    <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg px-4 py-2 flex items-center justify-between">
      <div className="text-xs text-amber-300">
        <span className="font-semibold">Session Delta:</span>{' '}
        {delta.missingWorkspaces.length} workspace{delta.missingWorkspaces.length > 1 ? 's' : ''} from your last session{' '}
        {delta.missingWorkspaces.length <= 3
          ? `not running: ${delta.missingWorkspaces.map((w) => {
              const ports = w.ports.map((p) => `:${p}`).join(', ')
              return `${w.name}${ports ? ` (${ports})` : ''}`
            }).join(', ')}`
          : 'not running'}
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-600 hover:text-amber-400 text-xs ml-4"
      >
        Dismiss
      </button>
    </div>
  )
}

export function TimelinePanel(): JSX.Element {
  const [events, setEvents] = useState<TimelineEvent[]>([])

  useEffect(() => {
    window.hydra.getTimelineEvents(50).then((evts: unknown[]) => {
      setEvents(evts as TimelineEvent[])
    })

    const interval = setInterval(() => {
      window.hydra.getTimelineEvents(50).then((evts: unknown[]) => {
        setEvents(evts as TimelineEvent[])
      })
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  if (events.length === 0) {
    return <div className="text-gray-600 text-xs">No events recorded yet</div>
  }

  return (
    <div className="space-y-1 text-xs overflow-y-auto max-h-full">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-start gap-2 py-1 px-2 rounded hover:bg-gray-800/30"
        >
          <span className={`${TYPE_COLORS[event.type]} shrink-0 w-4 text-center font-mono`}>
            {TYPE_ICONS[event.type]}
          </span>
          <span className="text-gray-500 font-mono shrink-0 w-12">
            {formatTime(event.timestamp)}
          </span>
          <span className="text-gray-300 flex-1">{event.message}</span>
          <span className="text-gray-700 shrink-0">{formatRelative(event.timestamp)}</span>
        </div>
      ))}
    </div>
  )
}
```

**Step 2: Wire into App.tsx**

In `src/renderer/src/App.tsx`:

Add imports:

```typescript
import { TimelinePanel, SessionDeltaBanner } from './panels/Timeline'
```

Add to `PANEL_DOTS`:

```typescript
  'Timeline': 'bg-lime-400',
```

Add to `PANEL_ACCENT_HEX`:

```typescript
  'Timeline': '#a3e635',
```

Add the Session Delta banner after the Scorecards strip row (after `</ScorecardsStrip>` closing div):

```tsx
<div className="col-span-3">
  <SessionDeltaBanner />
</div>
```

Replace the Row 5 (Git History) section with:

```tsx
        {/* Row 5: Git History (2 cols) + Timeline */}
        <Panel title="Git History" className="col-span-2">
          <GitHistoryPanel />
        </Panel>
        <Panel title="Timeline">
          <TimelinePanel />
        </Panel>
```

**Step 3: Verify compile**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add src/renderer/src/panels/Timeline.tsx src/renderer/src/App.tsx
git commit -m "feat(ui): add Timeline panel with event log and Session Delta banner"
```

---

## Phase 5: Command Palette

### Task 5.1: Create Command Palette component

**Files:**

- Create: `src/renderer/src/panels/CommandPalette.tsx`

**Step 1: Create the command palette**

Create `src/renderer/src/panels/CommandPalette.tsx`:

```typescript
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSystemStore } from '../stores/system'

interface PaletteCommand {
  id: string
  label: string
  aliases: string[]
  description: string
  action: () => Promise<void> | void
}

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (t.includes(q)) return true
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

export function CommandPalette({
  isOpen,
  onClose
}: {
  isOpen: boolean
  onClose: () => void
}): JSX.Element | null {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const state = useSystemStore((s) => s.state)
  const killProcess = useSystemStore((s) => s.killProcess)
  const signalProcess = useSystemStore((s) => s.signalProcess)

  const commands: PaletteCommand[] = []

  if (state) {
    const listeningPorts = state.ports.filter((p) => p.state === 'LISTEN')
    for (const port of listeningPorts) {
      commands.push({
        id: `kill-port-${port.port}`,
        label: `Kill port ${port.port}`,
        aliases: [`kill :${port.port}`, `stop ${port.port}`, port.process],
        description: `Kill ${port.process} (PID ${port.pid}) listening on :${port.port}`,
        action: () => killProcess(port.pid, port.process)
      })
    }

    const workspaces = state.processes.filter((g) => g.type !== 'other')
    for (const ws of workspaces) {
      commands.push({
        id: `freeze-${ws.name}`,
        label: `Freeze ${ws.name}`,
        aliases: [`pause ${ws.name}`, `stop ${ws.name}`, `suspend ${ws.name}`],
        description: `SIGSTOP all ${ws.processes.length} processes in ${ws.name}`,
        action: async () => {
          for (const p of ws.processes) {
            await signalProcess(p.pid, 'SIGSTOP')
          }
        }
      })
      commands.push({
        id: `thaw-${ws.name}`,
        label: `Thaw ${ws.name}`,
        aliases: [`resume ${ws.name}`, `unfreeze ${ws.name}`, `continue ${ws.name}`],
        description: `SIGCONT all ${ws.processes.length} processes in ${ws.name}`,
        action: async () => {
          for (const p of ws.processes) {
            await signalProcess(p.pid, 'SIGCONT')
          }
        }
      })
    }

    commands.push({
      id: 'top-cpu',
      label: 'What\'s using the most CPU?',
      aliases: ['cpu', 'top', 'hot', 'slow', 'heavy'],
      description: 'Show workspace sorted by CPU usage (top consumer first)',
      action: () => { onClose() }
    })

    commands.push({
      id: 'refresh',
      label: 'Refresh all monitors',
      aliases: ['reload', 'update', 'sync'],
      description: 'Force an immediate refresh of all system monitors',
      action: () => { useSystemStore.getState().refresh() }
    })
  }

  const filtered = query.length === 0
    ? commands
    : commands.filter(
        (cmd) =>
          fuzzyMatch(query, cmd.label) ||
          cmd.aliases.some((a) => fuzzyMatch(query, a))
      )

  const executeCommand = useCallback(async (cmd: PaletteCommand) => {
    onClose()
    setQuery('')
    await cmd.action()
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      executeCommand(filtered[selectedIndex])
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-start justify-center pt-[20vh] z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[560px] max-h-[400px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-800">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command... (kill port 3000, freeze next-app, ...)"
            className="w-full bg-transparent text-white text-sm outline-none placeholder-gray-600"
            autoFocus
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-3 text-gray-600 text-sm">No matching commands</div>
          )}
          {filtered.map((cmd, idx) => (
            <div
              key={cmd.id}
              className={`px-4 py-2 cursor-pointer flex items-center justify-between ${
                idx === selectedIndex
                  ? 'bg-cyan-950/40 border-l-2 border-cyan-400'
                  : 'hover:bg-gray-800/50 border-l-2 border-transparent'
              }`}
              onClick={() => executeCommand(cmd)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <div>
                <div className="text-sm text-white">{cmd.label}</div>
                <div className="text-xs text-gray-500">{cmd.description}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-4 text-[10px] text-gray-600">
          <span><kbd className="px-1 py-0.5 bg-gray-800 rounded">up/dn</kbd> navigate</span>
          <span><kbd className="px-1 py-0.5 bg-gray-800 rounded">Enter</kbd> execute</span>
          <span><kbd className="px-1 py-0.5 bg-gray-800 rounded">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Verify compile**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/renderer/src/panels/CommandPalette.tsx
git commit -m "feat(ui): add Command Palette with fuzzy search, kill/freeze/thaw commands, and keyboard navigation"
```

---

### Task 5.2: Wire Cmd+K shortcut into App

**Files:**

- Modify: `src/renderer/src/App.tsx`

**Step 1: Add Command Palette to App**

In `src/renderer/src/App.tsx`:

Add import:

```typescript
import { CommandPalette } from './panels/CommandPalette'
```

Update the React import to include `useState`:

```typescript
import { useEffect, useState } from 'react'
```

Inside the `App()` function, add state and keyboard listener (after the `useEffect` for `initialize`):

```typescript
const [paletteOpen, setPaletteOpen] = useState(false)

useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setPaletteOpen((open) => !open)
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [])
```

Add the Command Palette component inside the return JSX (before the closing `</div>` of the outermost div):

```tsx
<CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
```

**Step 2: Verify compile**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors

**Step 3: Run full test suite**

Run: `npx vitest --run 2>&1 | tail -10`
Expected: All tests pass, no regressions

**Step 4: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(ui): wire Cmd+K shortcut to open Command Palette"
```

---

## Final: Verification

### Task 6.1: Full build + test verification

**Step 1: Run the full test suite**

Run: `npx vitest --run 2>&1`
Expected: All tests pass (existing 100 + new health tests + new actions tests)

**Step 2: Verify the build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build completes without errors

**Step 3: Final commit (if any cleanup needed)**

Fix any issues found during verification, then:

```bash
git add -A
git commit -m "fix: cleanup and verify Mission Center feature build"
```

---

## Summary of All Files

### New Files (7)

| File                                         | Purpose                                          |
| -------------------------------------------- | ------------------------------------------------ |
| `src/main/actions.ts`                        | Process kill/signal handlers with PID validation |
| `src/main/actions.test.ts`                   | Tests for action handlers                        |
| `src/main/health.ts`                         | Pure health scoring function                     |
| `src/main/health.test.ts`                    | Tests for health scoring                         |
| `src/renderer/src/panels/CommandCenter.tsx`  | Unified workspace panel with actions             |
| `src/renderer/src/panels/Timeline.tsx`       | Activity timeline + session delta banner         |
| `src/renderer/src/panels/CommandPalette.tsx` | Cmd+K command palette                            |

### Modified Files (7)

| File                                | Changes                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `src/shared/types.ts`               | ProcessSignalType, ProcessActionResult, GroupActionResult, 5 new IPC channels |
| `src/preload/index.ts`              | 5 new bridge methods (kill, signal, killGroup, timeline, sessionDelta)        |
| `src/main/monitors/index.ts`        | 5 new IPC handlers, session snapshot logic, timeline event generation         |
| `src/main/db/schema.ts`             | sessions + timeline_events tables                                             |
| `src/main/db/queries.ts`            | CRUD for sessions + timeline_events                                           |
| `src/renderer/src/stores/system.ts` | Action methods + frozenPids tracking                                          |
| `src/renderer/src/App.tsx`          | Command Center, Timeline, Session Delta, Command Palette, Cmd+K               |
| `src/main/intelligence/briefing.ts` | Health scores in briefing prompt                                              |
