// Shared types between main and renderer processes

export interface ProcessInfo {
  pid: number
  user: string
  cpu: number
  mem: number
  command: string
  name: string
  cwd?: string
}

export interface ProcessGroup {
  name: string
  type: 'project' | 'agent' | 'service' | 'other'
  processes: ProcessInfo[]
  totalCpu: number
  totalMem: number
  ports: number[]
}

export interface PortInfo {
  port: number
  pid: number
  process: string
  protocol: 'TCP' | 'UDP'
  state: 'LISTEN' | 'ESTABLISHED' | 'CLOSE_WAIT' | 'OTHER'
  address: string
}

export type AgentStatus = 'active' | 'busy' | 'idle' | 'waiting' | 'unknown'

export interface AgentInfo {
  name: string
  type: 'claude-code' | 'codex' | 'gemini' | 'cursor' | 'aider' | 'continue' | 'copilot' | 'other'
  status: AgentStatus
  pid: number
  workingDir?: string
  tmuxSession?: string
  uptime?: number
}

export interface GitRepoInfo {
  path: string
  name: string
  branch: string
  dirty: boolean
  untracked: number
  modified: number
  ahead: number
  behind: number
  status: 'clean' | 'dirty' | 'diverged' | 'ahead' | 'behind' | 'error'
}

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
  path: string
  name: string
  action: 'allow' | 'block'
  type: 'user' | 'system'
}

export interface FirewallState {
  rules: FirewallRule[]
  totalAllowed: number
  totalBlocked: number
  lastUpdated: number
}

export interface SecurityScanResult {
  id: string
  command: string
  output: string
  timestamp: number
  status: 'running' | 'complete' | 'error'
}

export interface SecurityPosture {
  overallScore: number
  grade: string
  verdict: string
  categories: {
    name: string
    score: number
    weight: number
    summary: string
  }[]
}

export interface SystemState {
  timestamp: number
  processes: ProcessGroup[]
  ports: PortInfo[]
  agents: AgentInfo[]
  gitRepos: GitRepoInfo[]
  cpu: {
    usage: number
    cores: number
  }
  memory: {
    total: number
    used: number
    free: number
    usagePercent: number
  }
  network?: NetworkState
  firewall?: FirewallState
}

export interface LogLine {
  timestamp: number
  source: string // filename/label
  text: string
  level: 'info' | 'warn' | 'error' | 'debug'
}

export interface BriefingResult {
  summary: string
  alerts: BriefingAlert[]
  suggestions: string[]
  timestamp: number
}

export interface BriefingAlert {
  severity: 'info' | 'warning' | 'critical'
  message: string
  source: string
}

export type AutoHealAction = 'restart_process' | 'notify_only'

export interface AutoHealEvent {
  timestamp: number
  rule: string
  action: AutoHealAction
  target: string
  success: boolean
  message: string
}

export interface HydraNotification {
  id: string
  title: string
  body: string
  level: 'info' | 'warning' | 'critical'
  timestamp: number
  dismissed: boolean
}

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

export const IPC_CHANNELS = {
  SYSTEM_STATE_UPDATE: 'system:state-update',
  REQUEST_REFRESH: 'system:request-refresh',
  GET_INITIAL_STATE: 'system:get-initial-state',
  LOG_LINES: 'logs:lines',
  LOG_SOURCES: 'logs:sources',
  BRIEFING_REQUEST: 'intelligence:briefing-request',
  BRIEFING_RESULT: 'intelligence:briefing-result',
  AUTO_HEAL_EVENT: 'intelligence:auto-heal-event',
  NOTIFICATION: 'intelligence:notification',
  DISMISS_NOTIFICATION: 'intelligence:dismiss-notification',
  GET_HEAL_HISTORY: 'intelligence:get-heal-history',
  NETWORK_STATE: 'network:state',
  FIREWALL_STATE: 'firewall:state',
  GET_FIREWALL_RULES: 'firewall:get-rules',
  SECURITY_SCAN_REQUEST: 'security:scan-request',
  SECURITY_SCAN_RESULT: 'security:scan-result',
  SECURITY_POSTURE: 'security:posture',
  DB_QUERY_SNAPSHOTS: 'db:query-snapshots',
  DB_QUERY_ALERTS: 'db:query-alerts',
  DB_QUERY_BRIEFINGS: 'db:query-briefings',
  DB_QUERY_NOTIFICATIONS: 'db:query-notifications',
  CONFIG_GET: 'config:get',
  CONFIG_SAVE: 'config:save',
  GIT_COMMIT_HISTORY: 'git:commit-history',
  DB_QUERY_POSTURE_HISTORY: 'db:query-posture-history',
  GIT_ACTION: 'git:action',
  PROCESS_KILL: 'process:kill',
  PROCESS_SIGNAL: 'process:signal',
  PROCESS_KILL_GROUP: 'process:kill-group'
} as const

export interface GitActionResult {
  success: boolean
  output: string
}

export interface GitCommit {
  hash: string
  shortHash: string
  author: string
  email: string
  timestamp: number
  message: string
  isAiAuthored: boolean
  aiAgent?: string
  repoName: string
}

export interface PostureHistoryEntry {
  timestamp: number
  score: number
  grade: string
  verdict: string
}

export interface HydraConfig {
  apiKey?: string
  gitRepoPaths: string[]
  monitorInterval: number
  snapshotInterval: number
  staffBinPath?: string
  agentPatterns?: { type: string; displayName: string; patterns: string[] }[]
}
