# HYDRA Session 1 — Scaffold + Monitors Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Electron app that opens a dashboard window with a tray icon, polls system data (processes, ports, AI agents, git repos), and sends structured updates to the renderer over IPC.

**Architecture:** electron-vite scaffolds the Electron + React + TypeScript project. The main process runs monitor modules that shell out to `ps`, `lsof`, and `git`, parse the output into typed data structures, and push updates to the renderer every 2 seconds via Electron IPC. Vitest tests the parsers against captured sample output.

**Tech Stack:** Electron 33+, electron-vite, React 19, TypeScript, Tailwind 4, Zustand, Vitest

---

### Task 1: Scaffold electron-vite Project

**Files:**

- Create: `hydra/` (entire project scaffold)

**Step 1: Create the project**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred
npm create @quick-start/electron@latest hydra -- --template react-ts
```

Select: React, TypeScript when prompted. If non-interactive, the `--template react-ts` flag handles it.

**Step 2: Install dependencies**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npm install
```

**Step 3: Verify it runs**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npm run dev
```

Expected: Electron window opens with the default electron-vite React template. Close it.

**Step 4: Install Tailwind 4**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npm install tailwindcss @tailwindcss/vite
```

Add the Tailwind Vite plugin to `electron.vite.config.ts` in the renderer config:

```typescript
import tailwindcss from "@tailwindcss/vite";

// In the renderer config section:
renderer: {
  plugins: [tailwindcss()];
}
```

Replace the contents of `src/renderer/src/assets/main.css` with:

```css
@import "tailwindcss";
```

**Step 5: Install Vitest**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npm install -D vitest
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.ts` at project root:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/main/**/*.test.ts"],
  },
});
```

**Step 6: Install Zustand**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npm install zustand
```

**Step 7: Commit**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
git add -A
git commit -m "feat(hydra): scaffold electron-vite project with React, TypeScript, Tailwind, Vitest"
```

---

### Task 2: Define Type Interfaces

**Files:**

- Create: `hydra/src/shared/types.ts`

**Step 1: Write the type definitions**

```typescript
// src/shared/types.ts
// Shared types between main and renderer processes

export interface ProcessInfo {
  pid: number;
  user: string;
  cpu: number; // percentage
  mem: number; // percentage
  command: string; // full command string
  name: string; // short process name (basename of command)
  cwd?: string; // working directory if detectable
}

export interface ProcessGroup {
  name: string; // project name or category
  type: "project" | "agent" | "service" | "other";
  processes: ProcessInfo[];
  totalCpu: number;
  totalMem: number;
  ports: number[]; // ports owned by this group's processes
}

export interface PortInfo {
  port: number;
  pid: number;
  process: string; // process name owning this port
  protocol: "TCP" | "UDP";
  state: "LISTEN" | "ESTABLISHED" | "CLOSE_WAIT" | "OTHER";
  address: string; // bind address (e.g., "127.0.0.1", "*")
}

export type AgentStatus = "active" | "idle" | "waiting" | "unknown";

export interface AgentInfo {
  name: string; // "Claude Code", "Codex", etc.
  type: "claude-code" | "codex" | "gemini" | "other";
  status: AgentStatus;
  pid: number;
  workingDir?: string;
  tmuxSession?: string; // tmux session name if applicable
  uptime?: number; // seconds since process started
}

export interface GitRepoInfo {
  path: string; // absolute path to repo root
  name: string; // directory name
  branch: string;
  dirty: boolean;
  untracked: number; // count of untracked files
  modified: number; // count of modified files
  ahead: number; // commits ahead of remote
  behind: number; // commits behind remote
  status: "clean" | "dirty" | "diverged" | "ahead" | "behind" | "error";
}

export interface SystemState {
  timestamp: number;
  processes: ProcessGroup[];
  ports: PortInfo[];
  agents: AgentInfo[];
  gitRepos: GitRepoInfo[];
  cpu: {
    usage: number; // overall percentage
    cores: number;
  };
  memory: {
    total: number; // bytes
    used: number;
    free: number;
    usagePercent: number;
  };
}

// IPC channel names
export const IPC_CHANNELS = {
  SYSTEM_STATE_UPDATE: "system:state-update",
  REQUEST_REFRESH: "system:request-refresh",
  GET_INITIAL_STATE: "system:get-initial-state",
} as const;
```

**Step 2: Commit**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
git add src/shared/types.ts
git commit -m "feat(hydra): define shared type interfaces for system state"
```

---

### Task 3: Process Monitor

**Files:**

- Create: `hydra/src/main/monitors/processes.ts`
- Create: `hydra/src/main/monitors/processes.test.ts`

**Step 1: Write the failing test**

Create `src/main/monitors/processes.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseProcessOutput, groupProcesses } from "./processes";

const SAMPLE_PS_OUTPUT = `USER               PID  %CPU %MEM      VSZ    RSS   TT  STAT STARTED      TIME COMMAND
alsharma          1234   5.2  1.3  5073456  45632 s001  S+   10:30AM   0:12.34 node /Users/alsharma/Documents/ai/myAIProjects/Alfred/node_modules/.bin/vite
alsharma          2345  12.1  3.4  6012345  98765 s002  S+   09:15AM   1:23.45 /Users/alsharma/.nvm/versions/node/v22.0.0/bin/node /usr/local/bin/claude
alsharma          3456   0.1  0.5  4012345  12345 s003  S    08:00AM   0:02.10 /usr/local/bin/postgres -D /usr/local/var/postgres
root               567   0.0  0.1  2012345   4567   ??  Ss   07:00AM   0:00.50 /usr/sbin/syslogd
alsharma          4567   8.3  2.1  5512345  76543 s004  S+   10:45AM   0:45.67 node /Users/alsharma/Documents/ai/myAIProjects/health-scoring/server.js
alsharma          5678   1.2  0.8  3012345  23456 s005  S+   11:00AM   0:05.00 /usr/local/bin/codex --task refactor`;

describe("parseProcessOutput", () => {
  it("parses ps aux output into ProcessInfo array", () => {
    const result = parseProcessOutput(SAMPLE_PS_OUTPUT);
    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({
      pid: 1234,
      user: "alsharma",
      cpu: 5.2,
      mem: 1.3,
      command:
        "node /Users/alsharma/Documents/ai/myAIProjects/Alfred/node_modules/.bin/vite",
      name: "node",
      cwd: "/Users/alsharma/Documents/ai/myAIProjects/Alfred",
    });
  });

  it("skips the header line", () => {
    const result = parseProcessOutput(SAMPLE_PS_OUTPUT);
    expect(result.every((p) => p.pid > 0)).toBe(true);
  });

  it("detects working directory from command args", () => {
    const result = parseProcessOutput(SAMPLE_PS_OUTPUT);
    const viteProc = result.find((p) => p.pid === 1234);
    expect(viteProc?.cwd).toBe(
      "/Users/alsharma/Documents/ai/myAIProjects/Alfred",
    );
  });
});

describe("groupProcesses", () => {
  it("groups processes by detected project directory", () => {
    const processes = parseProcessOutput(SAMPLE_PS_OUTPUT);
    const groups = groupProcesses(processes);
    const alfredGroup = groups.find((g) => g.name === "Alfred");
    expect(alfredGroup).toBeDefined();
    expect(alfredGroup!.type).toBe("project");
    expect(alfredGroup!.processes.length).toBeGreaterThanOrEqual(1);
  });

  it("identifies agent processes", () => {
    const processes = parseProcessOutput(SAMPLE_PS_OUTPUT);
    const groups = groupProcesses(processes);
    const agentGroup = groups.find((g) => g.type === "agent");
    expect(agentGroup).toBeDefined();
    expect(
      agentGroup!.processes.some((p) => p.command.includes("claude")),
    ).toBe(true);
  });

  it("identifies service processes", () => {
    const processes = parseProcessOutput(SAMPLE_PS_OUTPUT);
    const groups = groupProcesses(processes);
    const serviceGroup = groups.find((g) => g.type === "service");
    expect(serviceGroup).toBeDefined();
    expect(serviceGroup!.processes.some((p) => p.name === "postgres")).toBe(
      true,
    );
  });

  it("calculates totalCpu and totalMem per group", () => {
    const processes = parseProcessOutput(SAMPLE_PS_OUTPUT);
    const groups = groupProcesses(processes);
    groups.forEach((g) => {
      const expectedCpu = g.processes.reduce((sum, p) => sum + p.cpu, 0);
      expect(g.totalCpu).toBeCloseTo(expectedCpu, 1);
    });
  });
});
```

**Step 2: Run the test to verify it fails**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npx vitest run src/main/monitors/processes.test.ts
```

Expected: FAIL — module `./processes` not found.

**Step 3: Implement the process monitor**

Create `src/main/monitors/processes.ts`:

```typescript
import { exec } from "child_process";
import { promisify } from "util";
import type { ProcessInfo, ProcessGroup } from "../../shared/types";

const execAsync = promisify(exec);

const AGENT_PATTERNS = ["claude", "codex", "gemini"];
const SERVICE_PATTERNS = [
  "postgres",
  "redis",
  "mysql",
  "mongo",
  "nginx",
  "docker",
];

export function parseProcessOutput(output: string): ProcessInfo[] {
  const lines = output.trim().split("\n");
  // Skip header line
  return lines
    .slice(1)
    .map((line) => {
      // ps aux columns are space-separated, but COMMAND can contain spaces
      // Format: USER PID %CPU %MEM VSZ RSS TT STAT STARTED TIME COMMAND...
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) return null;

      const user = parts[0];
      const pid = parseInt(parts[1], 10);
      const cpu = parseFloat(parts[2]);
      const mem = parseFloat(parts[3]);
      // COMMAND is everything from index 10 onward
      const command = parts.slice(10).join(" ");
      const name = extractProcessName(command);
      const cwd = extractWorkingDir(command);

      return { pid, user, cpu, mem, command, name, cwd } as ProcessInfo;
    })
    .filter((p): p is ProcessInfo => p !== null && !isNaN(p.pid));
}

function extractProcessName(command: string): string {
  // Get the first token (the executable), then its basename
  const executable = command.split(/\s+/)[0];
  return executable.split("/").pop() || executable;
}

function extractWorkingDir(command: string): string | undefined {
  // Look for absolute paths in command args that look like project directories
  const pathMatch = command.match(/\/(Users|home)\/[^\s]+/);
  if (!pathMatch) return undefined;

  const fullPath = pathMatch[0];
  // Walk up to find a likely project root (contains node_modules, .git, package.json pattern)
  // Heuristic: find the deepest directory that looks like a project
  const segments = fullPath.split("/");
  for (let i = segments.length - 1; i >= 3; i--) {
    const dir = segments.slice(0, i).join("/");
    // If this segment is a known non-project dir (node_modules, .bin, etc.), go up
    if (
      ["node_modules", ".bin", "bin", "lib", ".nvm", "versions"].includes(
        segments[i - 1],
      )
    ) {
      continue;
    }
    return dir;
  }
  return undefined;
}

export function groupProcesses(processes: ProcessInfo[]): ProcessGroup[] {
  const groups = new Map<string, ProcessGroup>();

  for (const proc of processes) {
    const { groupName, type } = classifyProcess(proc);
    const key = `${type}:${groupName}`;

    if (!groups.has(key)) {
      groups.set(key, {
        name: groupName,
        type,
        processes: [],
        totalCpu: 0,
        totalMem: 0,
        ports: [],
      });
    }

    const group = groups.get(key)!;
    group.processes.push(proc);
    group.totalCpu += proc.cpu;
    group.totalMem += proc.mem;
  }

  return Array.from(groups.values());
}

function classifyProcess(proc: ProcessInfo): {
  groupName: string;
  type: ProcessGroup["type"];
} {
  const cmdLower = proc.command.toLowerCase();
  const nameLower = proc.name.toLowerCase();

  // Check if it's an AI agent
  if (AGENT_PATTERNS.some((p) => cmdLower.includes(p))) {
    const agent = AGENT_PATTERNS.find((p) => cmdLower.includes(p))!;
    return {
      groupName: agent.charAt(0).toUpperCase() + agent.slice(1),
      type: "agent",
    };
  }

  // Check if it's a known service
  if (SERVICE_PATTERNS.some((p) => nameLower.includes(p))) {
    const service = SERVICE_PATTERNS.find((p) => nameLower.includes(p))!;
    return {
      groupName: service.charAt(0).toUpperCase() + service.slice(1),
      type: "service",
    };
  }

  // Check if we can identify a project from the working directory
  if (proc.cwd) {
    const projectName = proc.cwd.split("/").pop() || "Unknown";
    return { groupName: projectName, type: "project" };
  }

  return { groupName: "System", type: "other" };
}

export async function getProcesses(): Promise<ProcessInfo[]> {
  try {
    const { stdout } = await execAsync("ps aux");
    return parseProcessOutput(stdout);
  } catch {
    return [];
  }
}

export async function getProcessGroups(): Promise<ProcessGroup[]> {
  const processes = await getProcesses();
  return groupProcesses(processes);
}
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npx vitest run src/main/monitors/processes.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
git add src/main/monitors/processes.ts src/main/monitors/processes.test.ts
git commit -m "feat(hydra): process monitor with ps parsing and smart grouping"
```

---

### Task 4: Port Monitor

**Files:**

- Create: `hydra/src/main/monitors/ports.ts`
- Create: `hydra/src/main/monitors/ports.test.ts`

**Step 1: Write the failing test**

Create `src/main/monitors/ports.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseLsofOutput } from "./ports";

const SAMPLE_LSOF_OUTPUT = `COMMAND   PID     USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node     1234 alsharma   22u  IPv4 0x1234567890      0t0  TCP *:3000 (LISTEN)
node     1234 alsharma   23u  IPv4 0x1234567891      0t0  TCP 127.0.0.1:3001 (LISTEN)
postgres 3456 alsharma    5u  IPv4 0x1234567892      0t0  TCP *:5432 (LISTEN)
node     4567 alsharma   18u  IPv4 0x1234567893      0t0  TCP *:8080 (LISTEN)
node     1234 alsharma   24u  IPv4 0x1234567894      0t0  TCP 127.0.0.1:3000->127.0.0.1:54321 (ESTABLISHED)
redis-se 6789 alsharma    6u  IPv4 0x1234567895      0t0  TCP 127.0.0.1:6379 (LISTEN)`;

describe("parseLsofOutput", () => {
  it("parses lsof output into PortInfo array", () => {
    const result = parseLsofOutput(SAMPLE_LSOF_OUTPUT);
    expect(result.length).toBeGreaterThan(0);
  });

  it("extracts port numbers correctly", () => {
    const result = parseLsofOutput(SAMPLE_LSOF_OUTPUT);
    const ports = result.map((p) => p.port);
    expect(ports).toContain(3000);
    expect(ports).toContain(5432);
    expect(ports).toContain(8080);
    expect(ports).toContain(6379);
  });

  it("maps ports to process names", () => {
    const result = parseLsofOutput(SAMPLE_LSOF_OUTPUT);
    const pg = result.find((p) => p.port === 5432);
    expect(pg?.process).toBe("postgres");
    expect(pg?.pid).toBe(3456);
  });

  it("detects LISTEN vs ESTABLISHED state", () => {
    const result = parseLsofOutput(SAMPLE_LSOF_OUTPUT);
    const listen = result.filter((p) => p.state === "LISTEN");
    const established = result.filter((p) => p.state === "ESTABLISHED");
    expect(listen.length).toBeGreaterThan(0);
    expect(established.length).toBeGreaterThan(0);
  });

  it("extracts bind address", () => {
    const result = parseLsofOutput(SAMPLE_LSOF_OUTPUT);
    const localOnly = result.find((p) => p.port === 3001);
    expect(localOnly?.address).toBe("127.0.0.1");
    const wildcard = result.find(
      (p) => p.port === 3000 && p.state === "LISTEN",
    );
    expect(wildcard?.address).toBe("*");
  });
});
```

**Step 2: Run the test to verify it fails**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npx vitest run src/main/monitors/ports.test.ts
```

Expected: FAIL — module `./ports` not found.

**Step 3: Implement the port monitor**

Create `src/main/monitors/ports.ts`:

```typescript
import { exec } from "child_process";
import { promisify } from "util";
import type { PortInfo } from "../../shared/types";

const execAsync = promisify(exec);

export function parseLsofOutput(output: string): PortInfo[] {
  const lines = output.trim().split("\n");
  const results: PortInfo[] = [];

  for (const line of lines.slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 10) continue;

    const process = parts[0];
    const pid = parseInt(parts[1], 10);
    const type = parts[4]; // IPv4, IPv6

    if (!type?.startsWith("IPv")) continue;

    const protocol = parts[7] as "TCP" | "UDP";
    if (protocol !== "TCP" && protocol !== "UDP") continue;

    const nameField = parts[8]; // e.g., "*:3000" or "127.0.0.1:3000->127.0.0.1:54321"
    const stateField = parts[9]; // e.g., "(LISTEN)" or "(ESTABLISHED)"

    // Parse address and port from NAME field
    const parsed = parseNameField(nameField);
    if (!parsed) continue;

    const state = parseState(stateField);

    results.push({
      port: parsed.port,
      pid,
      process,
      protocol,
      state,
      address: parsed.address,
    });
  }

  return results;
}

function parseNameField(
  name: string,
): { address: string; port: number } | null {
  // Handle formats:
  // "*:3000" — wildcard listen
  // "127.0.0.1:3000" — specific bind
  // "127.0.0.1:3000->127.0.0.1:54321" — established connection
  // "[::1]:3000" — IPv6

  const localPart = name.split("->")[0];

  // Find the last colon to split address:port
  const lastColon = localPart.lastIndexOf(":");
  if (lastColon === -1) return null;

  const address = localPart.substring(0, lastColon);
  const port = parseInt(localPart.substring(lastColon + 1), 10);

  if (isNaN(port)) return null;

  return { address, port };
}

function parseState(stateField: string): PortInfo["state"] {
  if (!stateField) return "OTHER";
  const s = stateField.replace(/[()]/g, "").toUpperCase();
  if (s === "LISTEN") return "LISTEN";
  if (s === "ESTABLISHED") return "ESTABLISHED";
  if (s === "CLOSE_WAIT") return "CLOSE_WAIT";
  return "OTHER";
}

export async function getPorts(): Promise<PortInfo[]> {
  try {
    const { stdout } = await execAsync("lsof -i -P -n");
    return parseLsofOutput(stdout);
  } catch {
    return [];
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npx vitest run src/main/monitors/ports.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
git add src/main/monitors/ports.ts src/main/monitors/ports.test.ts
git commit -m "feat(hydra): port monitor with lsof parsing and port-to-process mapping"
```

---

### Task 5: Agent Detector

**Files:**

- Create: `hydra/src/main/monitors/agents.ts`
- Create: `hydra/src/main/monitors/agents.test.ts`

**Step 1: Write the failing test**

Create `src/main/monitors/agents.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { detectAgents } from "./agents";
import type { ProcessInfo } from "../../shared/types";

const mockProcesses: ProcessInfo[] = [
  {
    pid: 2345,
    user: "alsharma",
    cpu: 12.1,
    mem: 3.4,
    command:
      "/Users/alsharma/.nvm/versions/node/v22.0.0/bin/node /usr/local/bin/claude",
    name: "node",
    cwd: "/Users/alsharma/Documents/ai/myAIProjects/Alfred",
  },
  {
    pid: 5678,
    user: "alsharma",
    cpu: 1.2,
    mem: 0.8,
    command: "/usr/local/bin/codex --task refactor",
    name: "codex",
    cwd: "/Users/alsharma/Documents/ai/myAIProjects/health-scoring",
  },
  {
    pid: 1234,
    user: "alsharma",
    cpu: 5.2,
    mem: 1.3,
    command:
      "node /Users/alsharma/Documents/ai/myAIProjects/Alfred/node_modules/.bin/vite",
    name: "node",
    cwd: "/Users/alsharma/Documents/ai/myAIProjects/Alfred",
  },
];

describe("detectAgents", () => {
  it("identifies Claude Code processes", () => {
    const agents = detectAgents(mockProcesses);
    const claude = agents.find((a) => a.type === "claude-code");
    expect(claude).toBeDefined();
    expect(claude!.pid).toBe(2345);
    expect(claude!.name).toBe("Claude Code");
  });

  it("identifies Codex processes", () => {
    const agents = detectAgents(mockProcesses);
    const codex = agents.find((a) => a.type === "codex");
    expect(codex).toBeDefined();
    expect(codex!.pid).toBe(5678);
  });

  it("does not flag non-agent processes", () => {
    const agents = detectAgents(mockProcesses);
    expect(agents.length).toBe(2); // only claude + codex
  });

  it("detects working directory for agents", () => {
    const agents = detectAgents(mockProcesses);
    const claude = agents.find((a) => a.type === "claude-code");
    expect(claude!.workingDir).toBe(
      "/Users/alsharma/Documents/ai/myAIProjects/Alfred",
    );
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npx vitest run src/main/monitors/agents.test.ts
```

Expected: FAIL.

**Step 3: Implement agent detector**

Create `src/main/monitors/agents.ts`:

```typescript
import type { ProcessInfo, AgentInfo, AgentStatus } from "../../shared/types";

interface AgentPattern {
  type: AgentInfo["type"];
  displayName: string;
  patterns: string[]; // substrings to match in command
}

const AGENT_PATTERNS: AgentPattern[] = [
  {
    type: "claude-code",
    displayName: "Claude Code",
    patterns: ["/claude", "bin/claude", "claude-code"],
  },
  {
    type: "codex",
    displayName: "Codex",
    patterns: ["/codex", "bin/codex"],
  },
  {
    type: "gemini",
    displayName: "Gemini",
    patterns: ["/gemini", "bin/gemini"],
  },
];

export function detectAgents(processes: ProcessInfo[]): AgentInfo[] {
  const agents: AgentInfo[] = [];

  for (const proc of processes) {
    const cmdLower = proc.command.toLowerCase();

    for (const pattern of AGENT_PATTERNS) {
      if (pattern.patterns.some((p) => cmdLower.includes(p))) {
        agents.push({
          name: pattern.displayName,
          type: pattern.type,
          status: inferStatus(proc),
          pid: proc.pid,
          workingDir: proc.cwd,
        });
        break; // don't double-match
      }
    }
  }

  return agents;
}

function inferStatus(proc: ProcessInfo): AgentStatus {
  // Heuristic: high CPU = active, low CPU = idle
  // Future: tmux pane inspection for 'waiting' state
  if (proc.cpu > 5) return "active";
  if (proc.cpu > 0.5) return "idle";
  return "idle";
}
```

**Step 4: Run tests**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npx vitest run src/main/monitors/agents.test.ts
```

Expected: All PASS.

**Step 5: Commit**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
git add src/main/monitors/agents.ts src/main/monitors/agents.test.ts
git commit -m "feat(hydra): agent detector for Claude Code, Codex, Gemini"
```

---

### Task 6: Git Status Monitor

**Files:**

- Create: `hydra/src/main/monitors/git.ts`
- Create: `hydra/src/main/monitors/git.test.ts`

**Step 1: Write the failing test**

Create `src/main/monitors/git.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseGitStatus, parseGitAheadBehind } from "./git";

describe("parseGitStatus", () => {
  it("parses clean repo status", () => {
    const result = parseGitStatus("", "main");
    expect(result.dirty).toBe(false);
    expect(result.modified).toBe(0);
    expect(result.untracked).toBe(0);
  });

  it("counts modified files", () => {
    const statusOutput = " M src/index.ts\n M src/app.tsx\nMM src/utils.ts";
    const result = parseGitStatus(statusOutput, "main");
    expect(result.modified).toBe(3);
    expect(result.dirty).toBe(true);
  });

  it("counts untracked files", () => {
    const statusOutput = "?? new-file.ts\n?? another.ts\n M existing.ts";
    const result = parseGitStatus(statusOutput, "main");
    expect(result.untracked).toBe(2);
    expect(result.modified).toBe(1);
  });
});

describe("parseGitAheadBehind", () => {
  it("parses ahead count", () => {
    const result = parseGitAheadBehind("[ahead 3]");
    expect(result).toEqual({ ahead: 3, behind: 0 });
  });

  it("parses behind count", () => {
    const result = parseGitAheadBehind("[behind 5]");
    expect(result).toEqual({ ahead: 0, behind: 5 });
  });

  it("parses ahead and behind", () => {
    const result = parseGitAheadBehind("[ahead 2, behind 3]");
    expect(result).toEqual({ ahead: 2, behind: 3 });
  });

  it("handles no remote tracking", () => {
    const result = parseGitAheadBehind("");
    expect(result).toEqual({ ahead: 0, behind: 0 });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npx vitest run src/main/monitors/git.test.ts
```

Expected: FAIL.

**Step 3: Implement git monitor**

Create `src/main/monitors/git.ts`:

```typescript
import { exec } from "child_process";
import { promisify } from "util";
import type { GitRepoInfo } from "../../shared/types";

const execAsync = promisify(exec);

// Directories to scan for git repos — configurable later
const DEFAULT_SCAN_DIRS = ["~/Documents/ai/myAIProjects"];

export function parseGitStatus(
  porcelainOutput: string,
  branch: string,
): Pick<GitRepoInfo, "dirty" | "untracked" | "modified"> {
  const lines = porcelainOutput
    .trim()
    .split("\n")
    .filter((l) => l.length > 0);

  let untracked = 0;
  let modified = 0;

  for (const line of lines) {
    if (line.startsWith("??")) {
      untracked++;
    } else {
      modified++;
    }
  }

  return {
    dirty: lines.length > 0,
    untracked,
    modified,
  };
}

export function parseGitAheadBehind(statusBranchOutput: string): {
  ahead: number;
  behind: number;
} {
  const aheadMatch = statusBranchOutput.match(/ahead (\d+)/);
  const behindMatch = statusBranchOutput.match(/behind (\d+)/);

  return {
    ahead: aheadMatch ? parseInt(aheadMatch[1], 10) : 0,
    behind: behindMatch ? parseInt(behindMatch[1], 10) : 0,
  };
}

function resolveStatus(
  dirty: boolean,
  ahead: number,
  behind: number,
): GitRepoInfo["status"] {
  if (ahead > 0 && behind > 0) return "diverged";
  if (ahead > 0) return "ahead";
  if (behind > 0) return "behind";
  if (dirty) return "dirty";
  return "clean";
}

async function getRepoInfo(repoPath: string): Promise<GitRepoInfo | null> {
  try {
    const opts = { cwd: repoPath };

    const [branchResult, statusResult, aheadBehindResult] = await Promise.all([
      execAsync("git rev-parse --abbrev-ref HEAD", opts),
      execAsync("git status --porcelain", opts),
      execAsync("git status --branch --porcelain", opts),
    ]);

    const branch = branchResult.stdout.trim();
    const { dirty, untracked, modified } = parseGitStatus(
      statusResult.stdout,
      branch,
    );

    // First line of --branch --porcelain has ahead/behind info
    const branchLine = aheadBehindResult.stdout.split("\n")[0];
    const { ahead, behind } = parseGitAheadBehind(branchLine);

    return {
      path: repoPath,
      name: repoPath.split("/").pop() || repoPath,
      branch,
      dirty,
      untracked,
      modified,
      ahead,
      behind,
      status: resolveStatus(dirty, ahead, behind),
    };
  } catch {
    return null;
  }
}

export async function scanForRepos(
  scanDirs?: string[],
): Promise<GitRepoInfo[]> {
  const dirs = (scanDirs || DEFAULT_SCAN_DIRS).map((d) =>
    d.replace(/^~/, process.env.HOME || ""),
  );

  const repos: GitRepoInfo[] = [];

  for (const dir of dirs) {
    try {
      // Find immediate subdirectories that are git repos
      const { stdout } = await execAsync(
        `find "${dir}" -maxdepth 2 -name .git -type d 2>/dev/null`,
      );
      const repoPaths = stdout
        .trim()
        .split("\n")
        .filter((p) => p.length > 0)
        .map((p) => p.replace(/\/.git$/, ""));

      const results = await Promise.all(repoPaths.map(getRepoInfo));
      repos.push(...results.filter((r): r is GitRepoInfo => r !== null));
    } catch {
      // Skip directories that don't exist
    }
  }

  return repos;
}
```

**Step 4: Run tests**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npx vitest run src/main/monitors/git.test.ts
```

Expected: All PASS.

**Step 5: Commit**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
git add src/main/monitors/git.ts src/main/monitors/git.test.ts
git commit -m "feat(hydra): git status monitor with repo scanning and ahead/behind tracking"
```

---

### Task 7: Monitor Orchestrator + IPC

**Files:**

- Create: `hydra/src/main/monitors/index.ts`
- Modify: `hydra/src/main/index.ts`
- Create: `hydra/src/preload/index.ts` (replace scaffold default)

**Step 1: Create the monitor orchestrator**

Create `src/main/monitors/index.ts`:

```typescript
import { ipcMain, type BrowserWindow } from "electron";
import { getProcesses, groupProcesses } from "./processes";
import { getPorts } from "./ports";
import { detectAgents } from "./agents";
import { scanForRepos } from "./git";
import { cpus, freemem, totalmem } from "os";
import type { SystemState } from "../../shared/types";
import { IPC_CHANNELS } from "../../shared/types";

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let latestState: SystemState | null = null;

async function collectSystemState(): Promise<SystemState> {
  const [processes, ports, gitRepos] = await Promise.all([
    getProcesses(),
    getPorts(),
    scanForRepos(),
  ]);

  const processGroups = groupProcesses(processes);
  const agents = detectAgents(processes);

  // Assign port info to process groups
  for (const group of processGroups) {
    const groupPids = new Set(group.processes.map((p) => p.pid));
    group.ports = ports
      .filter((p) => groupPids.has(p.pid) && p.state === "LISTEN")
      .map((p) => p.port);
  }

  const cpuInfo = cpus();
  const totalMemory = totalmem();
  const freeMemory = freemem();

  return {
    timestamp: Date.now(),
    processes: processGroups,
    ports,
    agents,
    gitRepos,
    cpu: {
      usage:
        cpuInfo.reduce((acc, cpu) => {
          const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
          const idle = cpu.times.idle;
          return acc + ((total - idle) / total) * 100;
        }, 0) / cpuInfo.length,
      cores: cpuInfo.length,
    },
    memory: {
      total: totalMemory,
      used: totalMemory - freeMemory,
      free: freeMemory,
      usagePercent: ((totalMemory - freeMemory) / totalMemory) * 100,
    },
  };
}

export function startMonitoring(
  mainWindow: BrowserWindow,
  intervalMs = 2000,
): void {
  // Set up IPC handler for initial state request
  ipcMain.handle(IPC_CHANNELS.GET_INITIAL_STATE, async () => {
    if (!latestState) {
      latestState = await collectSystemState();
    }
    return latestState;
  });

  // Set up IPC handler for manual refresh
  ipcMain.on(IPC_CHANNELS.REQUEST_REFRESH, async () => {
    latestState = await collectSystemState();
    mainWindow.webContents.send(IPC_CHANNELS.SYSTEM_STATE_UPDATE, latestState);
  });

  // Periodic polling
  monitorInterval = setInterval(async () => {
    try {
      latestState = await collectSystemState();
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(
          IPC_CHANNELS.SYSTEM_STATE_UPDATE,
          latestState,
        );
      }
    } catch (err) {
      console.error("Monitor cycle failed:", err);
    }
  }, intervalMs);
}

export function stopMonitoring(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  ipcMain.removeHandler(IPC_CHANNELS.GET_INITIAL_STATE);
  ipcMain.removeAllListeners(IPC_CHANNELS.REQUEST_REFRESH);
}
```

**Step 2: Update preload script**

Replace `src/preload/index.ts` with:

```typescript
import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/types";
import type { SystemState } from "../shared/types";

const api = {
  getInitialState: (): Promise<SystemState> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_INITIAL_STATE),

  onSystemStateUpdate: (
    callback: (state: SystemState) => void,
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: SystemState) =>
      callback(state);
    ipcRenderer.on(IPC_CHANNELS.SYSTEM_STATE_UPDATE, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.SYSTEM_STATE_UPDATE, handler);
  },

  requestRefresh: (): void => {
    ipcRenderer.send(IPC_CHANNELS.REQUEST_REFRESH);
  },
};

contextBridge.exposeInMainWorld("hydra", api);

export type HydraAPI = typeof api;
```

**Step 3: Create type declaration for renderer**

Create `src/renderer/src/env.d.ts` (or append to existing):

```typescript
import type { HydraAPI } from "../../preload/index";

declare global {
  interface Window {
    hydra: HydraAPI;
  }
}
```

**Step 4: Commit**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
git add src/main/monitors/index.ts src/preload/index.ts src/renderer/src/env.d.ts
git commit -m "feat(hydra): monitor orchestrator with IPC bridge to renderer"
```

---

### Task 8: Electron Main Process + Tray Icon

**Files:**

- Modify: `hydra/src/main/index.ts` (replace scaffold default)

**Step 1: Replace the main process entry point**

Replace `src/main/index.ts` with:

```typescript
import { app, BrowserWindow, Menu, Tray, nativeImage, shell } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { startMonitoring, stopMonitoring } from "./monitors/index";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "HYDRA — Mission Control",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow!.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // Load the renderer
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  // Start system monitoring
  startMonitoring(mainWindow);

  mainWindow.on("closed", () => {
    mainWindow = null;
    stopMonitoring();
  });
}

function createTray(): void {
  // Create a simple 16x16 colored circle for the tray icon
  // Green = all good (default)
  const greenIcon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAACOSURBVHgBpZLRDYAgEEOrEzgCozCCGzkCbKArOIlugJvgoRAUNcLRpvGH19TkgFQWkqIohhK8UEaKwKcsOg/+WR1vX+AlA74u6q4FqgCOSzwsGHCwbKliAF89Cv89tWmOT4VaVMoVbOBrdQUz+FrD6XItzh4LzYB1HFJ9yrEkZ4l+wvcid9pTssh4UKbPd+4vED2Nd54iAAAAAElFTkSuQmCC",
  );

  tray = new Tray(greenIcon);
  tray.setToolTip("HYDRA — All systems nominal");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show HYDRA",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: "separator" },
    {
      label: "Refresh Now",
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send("system:request-refresh");
        }
      },
    },
    { type: "separator" },
    { role: "quit", label: "Quit HYDRA" },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.hydra.mission-control");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createTray();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Keep app running in tray when all windows closed (macOS behavior)
app.on("window-all-closed", () => {
  // Don't quit — stay in tray
});

app.on("before-quit", () => {
  stopMonitoring();
});
```

**Step 2: Verify it builds and runs**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npm run dev
```

Expected: Electron window opens with the default React template content. Tray icon appears in macOS menu bar. Closing the window keeps the tray icon alive.

**Step 3: Run all tests**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npx vitest run
```

Expected: All tests from Tasks 3-6 pass.

**Step 4: Commit**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
git add src/main/index.ts
git commit -m "feat(hydra): Electron main process with tray icon and monitor lifecycle"
```

---

### Task 9: Final — Verify Full Session 1

**Step 1: Run the full test suite**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npx vitest run
```

Expected: All tests pass.

**Step 2: Run the app**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
npm run dev
```

Expected:

- Electron window opens
- Tray icon appears (green dot)
- No console errors
- Closing window keeps tray alive
- Click tray icon toggles window

**Step 3: Verify IPC works**

Open Electron DevTools (Cmd+Shift+I in the window) and run:

```javascript
window.hydra.getInitialState().then((s) => console.log(s));
```

Expected: A SystemState object with processes, ports, agents, gitRepos, cpu, memory data. Processes should be grouped, agents should be detected if Claude Code or Codex are running.

**Step 4: Create Session 1 completion commit**

```bash
cd /Users/alsharma/Documents/ai/myAIProjects/Alfred/hydra
git add -A
git commit -m "feat(hydra): Session 1 complete — scaffold, monitors, IPC, tray icon"
```

---

## Session 1 Summary

After completing all tasks, you will have:

| Component       | Status           | Description                                 |
| --------------- | ---------------- | ------------------------------------------- |
| Electron shell  | Working          | Window + tray icon + lifecycle              |
| Process monitor | Working + Tested | Parses `ps aux`, groups by project/type     |
| Port monitor    | Working + Tested | Parses `lsof`, maps ports to processes      |
| Agent detector  | Working + Tested | Finds Claude Code, Codex, Gemini            |
| Git status      | Working + Tested | Scans repos for branch, dirty, ahead/behind |
| IPC bridge      | Working          | Main → renderer via contextBridge           |
| Shared types    | Done             | Full TypeScript interfaces for system state |

**Not yet built (Session 2):** React dashboard panels, live logs, Zustand store, actual UI rendering.
**Not yet built (Session 3):** Claude API briefing, auto-heal engine, notifications.
