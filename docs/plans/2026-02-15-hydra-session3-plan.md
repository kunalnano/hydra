# HYDRA Session 3 — Intelligence + Auto-Heal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add LLM intelligence layer (Claude Haiku briefing), auto-heal engine for crashed processes, native macOS notifications, and tray icon health status.

**Architecture:** Main process gets three new modules in `src/main/intelligence/`: briefing (Claude API), auto-heal (rule engine + restart), and rules (rule definitions). The renderer gets a new Briefing panel and a notification toast system. The tray icon changes color based on system health. IPC channels are extended to support briefing requests, auto-heal events, and notifications.

**Tech Stack:** Anthropic SDK (`@anthropic-ai/sdk`), Electron `Notification` API, Electron `globalShortcut`, existing Zustand store.

---

### Task 1: Install Anthropic SDK + Add New Shared Types

**Files:**

- Modify: `hydra/package.json` (add `@anthropic-ai/sdk`)
- Modify: `hydra/src/shared/types.ts` (add briefing, auto-heal, notification types + IPC channels)

**Step 1: Install the Anthropic SDK**

Run: `cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra && npm install @anthropic-ai/sdk`

**Step 2: Add new types to `hydra/src/shared/types.ts`**

Add these interfaces after `LogLine`:

```typescript
export interface BriefingResult {
  summary: string;
  alerts: BriefingAlert[];
  suggestions: string[];
  timestamp: number;
}

export interface BriefingAlert {
  severity: "info" | "warning" | "critical";
  message: string;
  source: string;
}

export type AutoHealAction = "restart_process" | "notify_only";

export interface AutoHealEvent {
  timestamp: number;
  rule: string;
  action: AutoHealAction;
  target: string;
  success: boolean;
  message: string;
}

export interface HydraNotification {
  id: string;
  title: string;
  body: string;
  level: "info" | "warning" | "critical";
  timestamp: number;
  dismissed: boolean;
}
```

Add these IPC channels to the existing `IPC_CHANNELS` const:

```typescript
BRIEFING_REQUEST: 'intelligence:briefing-request',
BRIEFING_RESULT: 'intelligence:briefing-result',
AUTO_HEAL_EVENT: 'intelligence:auto-heal-event',
NOTIFICATION: 'intelligence:notification',
DISMISS_NOTIFICATION: 'intelligence:dismiss-notification',
GET_HEAL_HISTORY: 'intelligence:get-heal-history',
```

**Step 3: Commit**

```bash
git add hydra/package.json hydra/package-lock.json hydra/src/shared/types.ts
git commit -m "feat(hydra): add Anthropic SDK and intelligence types"
```

---

### Task 2: Briefing Engine — Claude API Integration

**Files:**

- Create: `hydra/src/main/intelligence/briefing.ts`
- Create: `hydra/src/main/intelligence/briefing.test.ts`

**Step 1: Write the failing test**

Create `hydra/src/main/intelligence/briefing.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildBriefingPrompt, parseBriefingResponse } from "./briefing";
import type { SystemState } from "../../shared/types";

const mockState: SystemState = {
  timestamp: Date.now(),
  processes: [
    {
      name: "my-app",
      type: "project",
      processes: [
        {
          pid: 1234,
          user: "me",
          cpu: 45.2,
          mem: 3.1,
          command: "node server.js",
          name: "node",
        },
      ],
      totalCpu: 45.2,
      totalMem: 3.1,
      ports: [3000],
    },
    {
      name: "postgres",
      type: "service",
      processes: [
        {
          pid: 5678,
          user: "_postgres",
          cpu: 2.1,
          mem: 1.5,
          command: "postgres",
          name: "postgres",
        },
      ],
      totalCpu: 2.1,
      totalMem: 1.5,
      ports: [5432],
    },
  ],
  ports: [
    {
      port: 3000,
      pid: 1234,
      process: "node",
      protocol: "TCP",
      state: "LISTEN",
      address: "*",
    },
    {
      port: 5432,
      pid: 5678,
      process: "postgres",
      protocol: "TCP",
      state: "LISTEN",
      address: "*",
    },
  ],
  agents: [
    {
      name: "claude-code",
      type: "claude-code",
      status: "active",
      pid: 9999,
      workingDir: "/home/user/project",
    },
  ],
  gitRepos: [
    {
      path: "/home/user/project",
      name: "project",
      branch: "feature/auth",
      dirty: true,
      untracked: 2,
      modified: 3,
      ahead: 1,
      behind: 0,
      status: "dirty",
    },
  ],
  cpu: { usage: 35.5, cores: 10 },
  memory: {
    total: 32000000000,
    used: 18000000000,
    free: 14000000000,
    usagePercent: 56.3,
  },
};

describe("buildBriefingPrompt", () => {
  it("should include process groups in the prompt", () => {
    const prompt = buildBriefingPrompt(mockState);
    expect(prompt).toContain("my-app");
    expect(prompt).toContain("45.2");
    expect(prompt).toContain("port 3000");
  });

  it("should include agent info", () => {
    const prompt = buildBriefingPrompt(mockState);
    expect(prompt).toContain("claude-code");
    expect(prompt).toContain("active");
  });

  it("should include git status", () => {
    const prompt = buildBriefingPrompt(mockState);
    expect(prompt).toContain("feature/auth");
    expect(prompt).toContain("dirty");
  });

  it("should include system resources", () => {
    const prompt = buildBriefingPrompt(mockState);
    expect(prompt).toContain("35.5%");
    expect(prompt).toContain("56.3%");
  });
});

describe("parseBriefingResponse", () => {
  it("should parse a well-formed JSON response", () => {
    const raw = JSON.stringify({
      summary: "System running normally. 2 services active.",
      alerts: [
        {
          severity: "warning",
          message: "High CPU on my-app",
          source: "processes",
        },
      ],
      suggestions: ["Consider committing your changes"],
    });
    const result = parseBriefingResponse(raw);
    expect(result.summary).toBe("System running normally. 2 services active.");
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].severity).toBe("warning");
    expect(result.suggestions).toHaveLength(1);
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it("should handle response with just text (no JSON)", () => {
    const raw = "Everything looks fine. No issues detected.";
    const result = parseBriefingResponse(raw);
    expect(result.summary).toBe("Everything looks fine. No issues detected.");
    expect(result.alerts).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra && npx vitest run src/main/intelligence/briefing.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `hydra/src/main/intelligence/briefing.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { SystemState, BriefingResult } from "../../shared/types";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export function buildBriefingPrompt(state: SystemState): string {
  const sections: string[] = [];

  // System resources
  sections.push(
    `## System Resources\n- CPU: ${state.cpu.usage.toFixed(1)}% across ${state.cpu.cores} cores\n- Memory: ${state.memory.usagePercent.toFixed(1)}% used (${(state.memory.used / 1e9).toFixed(1)}GB / ${(state.memory.total / 1e9).toFixed(1)}GB)`,
  );

  // Process groups
  if (state.processes.length > 0) {
    const procLines = state.processes.map((g) => {
      const ports = g.ports.length > 0 ? ` (port ${g.ports.join(", ")})` : "";
      return `- ${g.name} [${g.type}]: CPU ${g.totalCpu.toFixed(1)}%, MEM ${g.totalMem.toFixed(1)}%${ports}`;
    });
    sections.push(`## Active Process Groups\n${procLines.join("\n")}`);
  }

  // AI Agents
  if (state.agents.length > 0) {
    const agentLines = state.agents.map(
      (a) =>
        `- ${a.name} (${a.type}): ${a.status}${a.workingDir ? ` in ${a.workingDir}` : ""}`,
    );
    sections.push(`## AI Agents\n${agentLines.join("\n")}`);
  }

  // Git repos
  if (state.gitRepos.length > 0) {
    const repoLines = state.gitRepos.map((r) => {
      const parts = [`${r.name}: ${r.branch} (${r.status})`];
      if (r.modified > 0) parts.push(`${r.modified} modified`);
      if (r.untracked > 0) parts.push(`${r.untracked} untracked`);
      if (r.ahead > 0) parts.push(`${r.ahead} ahead`);
      if (r.behind > 0) parts.push(`${r.behind} behind`);
      return `- ${parts.join(", ")}`;
    });
    sections.push(`## Git Repositories\n${repoLines.join("\n")}`);
  }

  // Ports
  const listeningPorts = state.ports.filter((p) => p.state === "LISTEN");
  if (listeningPorts.length > 0) {
    const portLines = listeningPorts.map(
      (p) => `- :${p.port} (${p.process}, ${p.protocol})`,
    );
    sections.push(`## Listening Ports\n${portLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

export function parseBriefingResponse(raw: string): BriefingResult {
  try {
    const parsed = JSON.parse(raw);
    return {
      summary: parsed.summary || raw,
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      timestamp: Date.now(),
    };
  } catch {
    return {
      summary: raw.trim(),
      alerts: [],
      suggestions: [],
      timestamp: Date.now(),
    };
  }
}

const SYSTEM_PROMPT = `You are HYDRA, an AI operations officer providing concise system briefings.

Analyze the system state and respond with JSON:
{
  "summary": "2-3 sentence overview of system health and activity",
  "alerts": [{"severity": "info|warning|critical", "message": "...", "source": "processes|ports|agents|git|memory|cpu"}],
  "suggestions": ["actionable suggestion 1", "..."]
}

Rules:
- Be concise. This is a dashboard briefing, not a report.
- Only raise alerts for things that actually need attention.
- Suggestions should be actionable (e.g. "commit changes on project X", "agent idle — consider assigning work").
- CPU > 80% = warning. CPU > 95% = critical.
- Memory > 85% = warning. Memory > 95% = critical.
- Dirty git repos with uncommitted changes for context = info suggestion.
- Agent in "waiting" status for extended time = warning.`;

export async function generateBriefing(
  state: SystemState,
): Promise<BriefingResult> {
  const prompt = buildBriefingPrompt(state);

  try {
    const anthropic = getClient();
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      message.content[0].type === "text"
        ? message.content[0].text
        : "No response generated.";
    return parseBriefingResponse(text);
  } catch (err) {
    return {
      summary: `Briefing failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      alerts: [
        {
          severity: "warning",
          message: "Could not reach Claude API",
          source: "briefing",
        },
      ],
      suggestions: ["Check ANTHROPIC_API_KEY environment variable"],
      timestamp: Date.now(),
    };
  }
}
```

**Step 4: Run tests**

Run: `cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra && npx vitest run src/main/intelligence/briefing.test.ts`
Expected: 6 tests PASS

**Step 5: Commit**

```bash
git add hydra/src/main/intelligence/briefing.ts hydra/src/main/intelligence/briefing.test.ts
git commit -m "feat(hydra): briefing engine with Claude Haiku API integration"
```

---

### Task 3: Auto-Heal Rules + Engine

**Files:**

- Create: `hydra/src/main/intelligence/rules.ts`
- Create: `hydra/src/main/intelligence/auto-heal.ts`
- Create: `hydra/src/main/intelligence/auto-heal.test.ts`

**Step 1: Write the test**

Create `hydra/src/main/intelligence/auto-heal.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateRules, type PreviousState } from "./auto-heal";
import { DEFAULT_RULES } from "./rules";
import type { SystemState, ProcessGroup } from "../../shared/types";

function makeState(overrides: Partial<SystemState> = {}): SystemState {
  return {
    timestamp: Date.now(),
    processes: [],
    ports: [],
    agents: [],
    gitRepos: [],
    cpu: { usage: 30, cores: 10 },
    memory: { total: 32e9, used: 16e9, free: 16e9, usagePercent: 50 },
    ...overrides,
  };
}

describe("evaluateRules", () => {
  it("should detect a disappeared dev server process group", () => {
    const devServer: ProcessGroup = {
      name: "my-app",
      type: "project",
      processes: [
        {
          pid: 100,
          user: "me",
          cpu: 5,
          mem: 2,
          command: "node server.js",
          name: "node",
        },
      ],
      totalCpu: 5,
      totalMem: 2,
      ports: [3000],
    };

    const prev: PreviousState = {
      state: makeState({ processes: [devServer] }),
      timestamp: Date.now() - 5000,
    };
    const current = makeState({ processes: [] });

    const events = evaluateRules(current, prev, DEFAULT_RULES);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].rule).toBe("process_disappeared");
    expect(events[0].target).toContain("my-app");
  });

  it("should detect high CPU", () => {
    const prev: PreviousState = {
      state: makeState({ cpu: { usage: 50, cores: 10 } }),
      timestamp: Date.now() - 5000,
    };
    const current = makeState({ cpu: { usage: 92, cores: 10 } });

    const events = evaluateRules(current, prev, DEFAULT_RULES);
    const cpuEvent = events.find((e) => e.rule === "high_cpu");
    expect(cpuEvent).toBeDefined();
    expect(cpuEvent!.action).toBe("notify_only");
  });

  it("should detect high memory", () => {
    const prev: PreviousState = {
      state: makeState(),
      timestamp: Date.now() - 5000,
    };
    const current = makeState({
      memory: { total: 32e9, used: 30e9, free: 2e9, usagePercent: 93 },
    });

    const events = evaluateRules(current, prev, DEFAULT_RULES);
    const memEvent = events.find((e) => e.rule === "high_memory");
    expect(memEvent).toBeDefined();
  });

  it("should detect a port that stopped listening", () => {
    const prev: PreviousState = {
      state: makeState({
        ports: [
          {
            port: 3000,
            pid: 100,
            process: "node",
            protocol: "TCP",
            state: "LISTEN",
            address: "*",
          },
        ],
      }),
      timestamp: Date.now() - 5000,
    };
    const current = makeState({ ports: [] });

    const events = evaluateRules(current, prev, DEFAULT_RULES);
    const portEvent = events.find((e) => e.rule === "port_disappeared");
    expect(portEvent).toBeDefined();
    expect(portEvent!.target).toContain("3000");
  });

  it("should return empty array when nothing changed", () => {
    const state = makeState();
    const prev: PreviousState = { state, timestamp: Date.now() - 5000 };
    const events = evaluateRules(state, prev, DEFAULT_RULES);
    expect(events).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra && npx vitest run src/main/intelligence/auto-heal.test.ts`
Expected: FAIL

**Step 3: Write rules.ts**

Create `hydra/src/main/intelligence/rules.ts`:

```typescript
export interface HealRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export const DEFAULT_RULES: HealRule[] = [
  {
    id: "process_disappeared",
    name: "Process Disappeared",
    description: "A known process group disappeared between monitor cycles",
    enabled: true,
  },
  {
    id: "port_disappeared",
    name: "Port Stopped Listening",
    description: "A previously listening port is no longer active",
    enabled: true,
  },
  {
    id: "high_cpu",
    name: "High CPU Usage",
    description: "System CPU exceeds 90%",
    enabled: true,
  },
  {
    id: "high_memory",
    name: "High Memory Usage",
    description: "System memory exceeds 90%",
    enabled: true,
  },
  {
    id: "agent_waiting_long",
    name: "Agent Waiting Too Long",
    description: "An AI agent has been in waiting status for extended time",
    enabled: true,
  },
];
```

**Step 4: Write auto-heal.ts**

Create `hydra/src/main/intelligence/auto-heal.ts`:

```typescript
import type { SystemState, AutoHealEvent } from "../../shared/types";
import type { HealRule } from "./rules";

export interface PreviousState {
  state: SystemState;
  timestamp: number;
}

const CPU_THRESHOLD = 90;
const MEMORY_THRESHOLD = 90;

export function evaluateRules(
  current: SystemState,
  previous: PreviousState | null,
  rules: HealRule[],
): AutoHealEvent[] {
  if (!previous) return [];

  const events: AutoHealEvent[] = [];
  const enabledIds = new Set(rules.filter((r) => r.enabled).map((r) => r.id));
  const prev = previous.state;

  // Rule: process_disappeared
  if (enabledIds.has("process_disappeared")) {
    const currentNames = new Set(current.processes.map((p) => p.name));
    for (const group of prev.processes) {
      if (group.type === "project" && !currentNames.has(group.name)) {
        events.push({
          timestamp: Date.now(),
          rule: "process_disappeared",
          action: "notify_only",
          target: group.name,
          success: true,
          message: `Process group "${group.name}" disappeared (was using ports: ${group.ports.join(", ") || "none"})`,
        });
      }
    }
  }

  // Rule: port_disappeared
  if (enabledIds.has("port_disappeared")) {
    const currentListening = new Set(
      current.ports.filter((p) => p.state === "LISTEN").map((p) => p.port),
    );
    const prevListening = prev.ports.filter((p) => p.state === "LISTEN");
    for (const port of prevListening) {
      if (!currentListening.has(port.port)) {
        events.push({
          timestamp: Date.now(),
          rule: "port_disappeared",
          action: "notify_only",
          target: `port ${port.port} (${port.process})`,
          success: true,
          message: `Port ${port.port} (${port.process}) stopped listening`,
        });
      }
    }
  }

  // Rule: high_cpu
  if (enabledIds.has("high_cpu") && current.cpu.usage > CPU_THRESHOLD) {
    events.push({
      timestamp: Date.now(),
      rule: "high_cpu",
      action: "notify_only",
      target: "system",
      success: true,
      message: `CPU usage at ${current.cpu.usage.toFixed(1)}% (threshold: ${CPU_THRESHOLD}%)`,
    });
  }

  // Rule: high_memory
  if (
    enabledIds.has("high_memory") &&
    current.memory.usagePercent > MEMORY_THRESHOLD
  ) {
    events.push({
      timestamp: Date.now(),
      rule: "high_memory",
      action: "notify_only",
      target: "system",
      success: true,
      message: `Memory usage at ${current.memory.usagePercent.toFixed(1)}% (threshold: ${MEMORY_THRESHOLD}%)`,
    });
  }

  return events;
}
```

**Step 5: Run tests**

Run: `cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra && npx vitest run src/main/intelligence/auto-heal.test.ts`
Expected: 5 tests PASS

**Step 6: Commit**

```bash
git add hydra/src/main/intelligence/rules.ts hydra/src/main/intelligence/auto-heal.ts hydra/src/main/intelligence/auto-heal.test.ts
git commit -m "feat(hydra): auto-heal rule engine with process/port/cpu/memory detection"
```

---

### Task 4: Wire Intelligence Into Monitor Orchestrator + IPC

**Files:**

- Modify: `hydra/src/main/monitors/index.ts` (add auto-heal evaluation per cycle, briefing IPC handler)
- Modify: `hydra/src/preload/index.ts` (add briefing + notification IPC methods)
- Modify: `hydra/src/renderer/src/env.d.ts` (update HydraAPI type)

**Step 1: Update the monitor orchestrator**

In `hydra/src/main/monitors/index.ts`, add imports and wire auto-heal + briefing:

```typescript
import { evaluateRules } from "../intelligence/auto-heal";
import type { PreviousState } from "../intelligence/auto-heal";
import { generateBriefing } from "../intelligence/briefing";
import { DEFAULT_RULES } from "../intelligence/rules";
import type { AutoHealEvent, HydraNotification } from "../../shared/types";
```

Add state tracking:

```typescript
let previousState: PreviousState | null = null;
let healHistory: AutoHealEvent[] = [];
let notifications: HydraNotification[] = [];
```

In the monitor interval callback, after updating `latestState`, add auto-heal evaluation:

```typescript
// Auto-heal evaluation
const events = evaluateRules(latestState, previousState, DEFAULT_RULES);
if (events.length > 0) {
  healHistory = [...healHistory.slice(-100), ...events];
  for (const event of events) {
    mainWindow.webContents.send(IPC_CHANNELS.AUTO_HEAL_EVENT, event);
    // Create notification for each event
    const notif: HydraNotification = {
      id: `${event.timestamp}-${event.rule}`,
      title: event.rule
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      body: event.message,
      level: event.rule.includes("high") ? "warning" : "critical",
      timestamp: event.timestamp,
      dismissed: false,
    };
    notifications.push(notif);
    mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, notif);
  }
}
previousState = { state: latestState, timestamp: Date.now() };
```

Add IPC handlers inside `startMonitoring()`:

```typescript
ipcMain.handle(IPC_CHANNELS.BRIEFING_REQUEST, async () => {
  if (!latestState) return null;
  return generateBriefing(latestState);
});

ipcMain.handle(IPC_CHANNELS.GET_HEAL_HISTORY, () => healHistory);

ipcMain.on(IPC_CHANNELS.DISMISS_NOTIFICATION, (_event, id: string) => {
  const notif = notifications.find((n) => n.id === id);
  if (notif) notif.dismissed = true;
});
```

In `stopMonitoring()`, add cleanup for the new handlers:

```typescript
ipcMain.removeHandler(IPC_CHANNELS.BRIEFING_REQUEST);
ipcMain.removeHandler(IPC_CHANNELS.GET_HEAL_HISTORY);
ipcMain.removeAllListeners(IPC_CHANNELS.DISMISS_NOTIFICATION);
previousState = null;
healHistory = [];
notifications = [];
```

**Step 2: Update preload**

In `hydra/src/preload/index.ts`, add these methods to the `api` object:

```typescript
requestBriefing: (): Promise<BriefingResult | null> =>
  ipcRenderer.invoke(IPC_CHANNELS.BRIEFING_REQUEST),

onAutoHealEvent: (callback: (event: AutoHealEvent) => void): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, healEvent: AutoHealEvent): void =>
    callback(healEvent)
  ipcRenderer.on(IPC_CHANNELS.AUTO_HEAL_EVENT, handler)
  return (): void => {
    ipcRenderer.removeListener(IPC_CHANNELS.AUTO_HEAL_EVENT, handler)
  }
},

onNotification: (callback: (notif: HydraNotification) => void): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, notif: HydraNotification): void =>
    callback(notif)
  ipcRenderer.on(IPC_CHANNELS.NOTIFICATION, handler)
  return (): void => {
    ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION, handler)
  }
},

dismissNotification: (id: string): void => {
  ipcRenderer.send(IPC_CHANNELS.DISMISS_NOTIFICATION, id)
},

getHealHistory: (): Promise<AutoHealEvent[]> =>
  ipcRenderer.invoke(IPC_CHANNELS.GET_HEAL_HISTORY),
```

Also add the necessary type imports at the top of the preload:

```typescript
import type {
  SystemState,
  LogLine,
  BriefingResult,
  AutoHealEvent,
  HydraNotification,
} from "../shared/types";
```

**Step 3: Build to verify wiring compiles**

Run: `cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra && npx electron-vite build`
Expected: All 3 targets build successfully

**Step 4: Commit**

```bash
git add hydra/src/main/monitors/index.ts hydra/src/preload/index.ts hydra/src/renderer/src/env.d.ts
git commit -m "feat(hydra): wire intelligence engine into monitor loop and IPC"
```

---

### Task 5: Briefing Panel (Renderer)

**Files:**

- Create: `hydra/src/renderer/src/panels/Briefing.tsx`
- Modify: `hydra/src/renderer/src/App.tsx` (add Briefing panel to grid)

**Step 1: Create Briefing panel**

Create `hydra/src/renderer/src/panels/Briefing.tsx`:

```tsx
import { useState } from "react";
import type { BriefingResult, BriefingAlert } from "../../../../shared/types";

const SEVERITY_STYLES: Record<BriefingAlert["severity"], string> = {
  info: "text-blue-400 bg-blue-950/30 border-blue-900",
  warning: "text-amber-400 bg-amber-950/30 border-amber-900",
  critical: "text-red-400 bg-red-950/30 border-red-900",
};

export function BriefingPanel(): JSX.Element {
  const [briefing, setBriefing] = useState<BriefingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestBriefing = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.hydra.requestBriefing();
      if (result) {
        setBriefing(result);
      } else {
        setError("No system state available yet");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Briefing failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col text-sm">
      <div className="flex items-center justify-between pb-3">
        <button
          onClick={requestBriefing}
          disabled={loading}
          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors font-medium"
        >
          {loading ? "Generating..." : "Request Briefing"}
        </button>
        {briefing && (
          <span className="text-xs text-gray-600 font-mono">
            {new Date(briefing.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && <div className="text-red-400 text-xs mb-2">{error}</div>}

      {!briefing && !loading && !error && (
        <div className="text-gray-600 text-xs flex-1 flex items-center justify-center">
          Press the button or Cmd+B for an AI briefing
        </div>
      )}

      {briefing && (
        <div className="flex-1 overflow-y-auto space-y-3">
          <p className="text-gray-300 leading-relaxed">{briefing.summary}</p>

          {briefing.alerts.length > 0 && (
            <div className="space-y-1">
              {briefing.alerts.map((alert, i) => (
                <div
                  key={i}
                  className={`text-xs px-2 py-1.5 rounded border ${SEVERITY_STYLES[alert.severity]}`}
                >
                  <span className="font-medium uppercase text-[10px] mr-1">
                    {alert.severity}
                  </span>
                  {alert.message}
                </div>
              ))}
            </div>
          )}

          {briefing.suggestions.length > 0 && (
            <div className="space-y-1">
              <div className="text-gray-500 text-xs uppercase tracking-wider">
                Suggestions
              </div>
              {briefing.suggestions.map((s, i) => (
                <div
                  key={i}
                  className="text-gray-400 text-xs pl-2 border-l border-gray-800"
                >
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Update App.tsx grid layout**

In `hydra/src/renderer/src/App.tsx`:

- Import `BriefingPanel` from `./panels/Briefing`
- Change the grid from 2x3 to accommodate the briefing panel. New layout:
  - Row 1: Workspaces | Agents
  - Row 2: Git Status | Briefing
  - Row 3: Ports | (Briefing spans if needed)
  - Row 4: Logs (col-span-2)

Updated `<main>` grid:

```tsx
<main className="flex-1 p-4 grid grid-cols-2 grid-rows-[1fr_1fr_1fr_minmax(180px,1fr)] gap-4 overflow-hidden">
  <Panel title="Workspaces">
    <WorkspacesPanel />
  </Panel>
  <Panel title="Agents">
    <AgentsPanel />
  </Panel>
  <Panel title="Git Status">
    <GitStatusPanel />
  </Panel>
  <Panel title="AI Briefing">
    <BriefingPanel />
  </Panel>
  <Panel title="Ports">
    <PortsPanel />
  </Panel>
  <Panel title="Notifications" className="flex flex-col">
    <NotificationsPanel />
  </Panel>
  <Panel title="Logs" className="col-span-2 flex flex-col">
    <LogsPanel />
  </Panel>
</main>
```

Note: NotificationsPanel will be created in Task 6.

**Step 3: Build to verify**

Run: `cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra && npx electron-vite build`

**Step 4: Commit**

```bash
git add hydra/src/renderer/src/panels/Briefing.tsx hydra/src/renderer/src/App.tsx
git commit -m "feat(hydra): AI briefing panel with Claude Haiku integration"
```

---

### Task 6: Notifications Panel + Native macOS Notifications

**Files:**

- Create: `hydra/src/renderer/src/panels/Notifications.tsx`
- Modify: `hydra/src/main/monitors/index.ts` (add Electron Notification for critical events)
- Modify: `hydra/src/renderer/src/App.tsx` (import NotificationsPanel)

**Step 1: Create Notifications panel**

Create `hydra/src/renderer/src/panels/Notifications.tsx`:

```tsx
import { useState, useEffect } from "react";
import type {
  HydraNotification,
  AutoHealEvent,
} from "../../../../shared/types";

const LEVEL_STYLES: Record<HydraNotification["level"], string> = {
  info: "border-l-blue-500",
  warning: "border-l-amber-500",
  critical: "border-l-red-500",
};

export function NotificationsPanel(): JSX.Element {
  const [notifications, setNotifications] = useState<HydraNotification[]>([]);

  useEffect(() => {
    const unsubNotif = window.hydra.onNotification((notif) => {
      setNotifications((prev) => [notif, ...prev].slice(0, 50));
    });
    return unsubNotif;
  }, []);

  const dismiss = (id: string): void => {
    window.hydra.dismissNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  if (notifications.length === 0) {
    return (
      <div className="text-gray-600 text-sm h-full flex items-center justify-center">
        No notifications
      </div>
    );
  }

  return (
    <div className="overflow-y-auto max-h-full space-y-1">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`text-xs px-2 py-1.5 border-l-2 bg-gray-800/30 rounded-r flex items-start justify-between gap-2 ${LEVEL_STYLES[n.level]}`}
        >
          <div className="min-w-0">
            <div className="text-gray-300 font-medium">{n.title}</div>
            <div className="text-gray-500 truncate">{n.body}</div>
          </div>
          <button
            onClick={() => dismiss(n.id)}
            className="text-gray-600 hover:text-gray-400 shrink-0 text-[10px]"
          >
            DISMISS
          </button>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Add native macOS notifications for critical events**

In `hydra/src/main/monitors/index.ts`, add this import at the top:

```typescript
import { Notification } from "electron";
```

Then inside the auto-heal event loop (where notifications are created), after pushing to the `notifications` array, add:

```typescript
if (notif.level === "critical" || notif.level === "warning") {
  new Notification({
    title: `HYDRA: ${notif.title}`,
    body: notif.body,
  }).show();
}
```

**Step 3: Import NotificationsPanel in App.tsx**

Add to imports:

```typescript
import { NotificationsPanel } from "./panels/Notifications";
```

**Step 4: Build to verify**

Run: `cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra && npx electron-vite build`

**Step 5: Commit**

```bash
git add hydra/src/renderer/src/panels/Notifications.tsx hydra/src/main/monitors/index.ts hydra/src/renderer/src/App.tsx
git commit -m "feat(hydra): notifications panel with native macOS alerts for critical events"
```

---

### Task 7: Tray Icon Health Status (Green/Yellow/Red)

**Files:**

- Modify: `hydra/src/main/index.ts` (dynamic tray icon based on system health)

**Step 1: Create tray icon color variants**

In `hydra/src/main/index.ts`, replace the single green icon with a function that generates colored icons:

```typescript
function createTrayIcon(
  color: "green" | "yellow" | "red",
): Electron.NativeImage {
  const colors = {
    green: { r: 74, g: 222, b: 128 }, // #4ade80
    yellow: { r: 251, g: 191, b: 36 }, // #fbbf24
    red: { r: 248, g: 113, b: 113 }, // #f87171
  };
  const c = colors[color];

  // 16x16 PNG with single colored circle
  // This is a minimal valid PNG with a colored 8x8 circle centered in 16x16
  // We use a Canvas-like approach via raw Buffer
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4, 0);
  const cx = 8,
    cy = 8,
    radius = 6;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx,
        dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        const idx = (y * size + x) * 4;
        canvas[idx] = c.r;
        canvas[idx + 1] = c.g;
        canvas[idx + 2] = c.b;
        canvas[idx + 3] = 255;
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}
```

**Step 2: Add health evaluation function**

```typescript
function evaluateSystemHealth(state: SystemState): "green" | "yellow" | "red" {
  if (state.cpu.usage > 95 || state.memory.usagePercent > 95) return "red";
  if (state.cpu.usage > 80 || state.memory.usagePercent > 85) return "yellow";
  // Check for agents in waiting state
  if (state.agents.some((a) => a.status === "waiting")) return "yellow";
  return "green";
}
```

**Step 3: Wire tray icon updates into the IPC**

Add a handler that updates the tray icon whenever system state changes. In `createWindow()`, after `startMonitoring(mainWindow)`:

```typescript
import { IPC_CHANNELS } from "../shared/types";
import type { SystemState } from "../shared/types";

// Update tray icon based on health
mainWindow.webContents.on("ipc-message", (_event, channel) => {
  // We'll use a different approach - listen for state updates from main process
});
```

Actually, simpler approach: export a function from `monitors/index.ts` that the main process calls, or add a callback. Best approach: add a `setTrayUpdateCallback` that main/index.ts sets, and the orchestrator calls it each cycle.

In `hydra/src/main/monitors/index.ts`, add:

```typescript
let trayCallback: ((state: SystemState) => void) | null = null;

export function onStateUpdate(callback: (state: SystemState) => void): void {
  trayCallback = callback;
}
```

Call it in the monitor interval after setting `latestState`:

```typescript
if (trayCallback) trayCallback(latestState);
```

In `hydra/src/main/index.ts`, after `startMonitoring(mainWindow)`:

```typescript
import { onStateUpdate } from "./monitors/index";

onStateUpdate((state) => {
  if (tray) {
    const health = evaluateSystemHealth(state);
    tray.setImage(createTrayIcon(health));
    const tooltips = {
      green: "HYDRA — All systems nominal",
      yellow: "HYDRA — Warning: attention needed",
      red: "HYDRA — Critical: immediate attention required",
    };
    tray.setToolTip(tooltips[health]);
  }
});
```

**Step 4: Build to verify**

Run: `cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra && npx electron-vite build`

**Step 5: Commit**

```bash
git add hydra/src/main/index.ts hydra/src/main/monitors/index.ts
git commit -m "feat(hydra): dynamic tray icon health status (green/yellow/red)"
```

---

### Task 8: Global Hotkey for Briefing (Cmd+B)

**Files:**

- Modify: `hydra/src/main/index.ts` (register globalShortcut for Cmd+B)

**Step 1: Add globalShortcut import and registration**

In `hydra/src/main/index.ts`, add `globalShortcut` to the electron import:

```typescript
import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  shell,
  globalShortcut,
  Notification,
} from "electron";
```

In `app.whenReady().then(...)`, after `createWindow()`, add:

```typescript
globalShortcut.register("CommandOrControl+B", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("shortcut:request-briefing");
  }
});
```

In the preload, add a listener for the shortcut:

```typescript
onBriefingShortcut: (callback: () => void): (() => void) => {
  const handler = (): void => callback()
  ipcRenderer.on('shortcut:request-briefing', handler)
  return (): void => {
    ipcRenderer.removeListener('shortcut:request-briefing', handler)
  }
},
```

In `Briefing.tsx`, add a `useEffect` to listen for the shortcut:

```tsx
useEffect(() => {
  const unsub = window.hydra.onBriefingShortcut(() => {
    requestBriefing();
  });
  return unsub;
}, []);
```

In `app.on('before-quit')`, add:

```typescript
globalShortcut.unregisterAll();
```

**Step 2: Build to verify**

Run: `cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra && npx electron-vite build`

**Step 3: Commit**

```bash
git add hydra/src/main/index.ts hydra/src/preload/index.ts hydra/src/renderer/src/panels/Briefing.tsx
git commit -m "feat(hydra): Cmd+B global hotkey triggers AI briefing"
```

---

### Task 9: Full Test Suite + Build Verification

**Step 1: Run all tests**

Run: `cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra && npx vitest run`
Expected: All tests pass (27 existing + 11 new = 38 total)

**Step 2: Build all targets**

Run: `cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra && npx electron-vite build`
Expected: Clean build, all 3 targets

**Step 3: Verify type checking**

Run: `cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra && npx tsc --noEmit -p tsconfig.node.json --composite false 2>&1; npx tsc --noEmit -p tsconfig.web.json --composite false 2>&1`
Expected: No errors (or only pre-existing @tailwindcss/vite warning)

**Step 4: Verify file structure**

Expected new files:

```
hydra/src/main/intelligence/
├── briefing.ts
├── briefing.test.ts
├── auto-heal.ts
├── auto-heal.test.ts
└── rules.ts
hydra/src/renderer/src/panels/
├── Briefing.tsx
└── Notifications.tsx
```

**Step 5: Document Session 3 completion or remaining issues**
