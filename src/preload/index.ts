import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import type {
  SystemState,
  LogLine,
  BriefingResult,
  AutoHealEvent,
  HelmNotification,
  LmStudioHealResult,
  NetworkState,
  FirewallState,
  SecurityScanResult,
  SecurityPosture,
  HelmConfig,
  GitCommit,
  PostureHistoryEntry,
  GitActionResult,
  ProcessSignalType,
  ProcessActionResult,
  GroupActionResult,
  CCUsageState,
  SkillFeed,
  DBSnapshot
} from '../shared/types'

const api = {
  getInitialState: (): Promise<SystemState> => ipcRenderer.invoke(IPC_CHANNELS.GET_INITIAL_STATE),

  onSystemStateUpdate: (callback: (state: SystemState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: SystemState): void => callback(state)
    ipcRenderer.on(IPC_CHANNELS.SYSTEM_STATE_UPDATE, handler)
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.SYSTEM_STATE_UPDATE, handler)
    }
  },

  requestRefresh: (): void => {
    ipcRenderer.send(IPC_CHANNELS.REQUEST_REFRESH)
  },

  onLogLines: (callback: (lines: LogLine[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, lines: LogLine[]): void => callback(lines)
    ipcRenderer.on(IPC_CHANNELS.LOG_LINES, handler)
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.LOG_LINES, handler)
    }
  },

  getLogSources: (): Promise<string[]> => ipcRenderer.invoke(IPC_CHANNELS.LOG_SOURCES),

  requestBriefing: (): Promise<BriefingResult | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.BRIEFING_REQUEST),

  healLmStudio: (): Promise<LmStudioHealResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.LM_STUDIO_HEAL),

  requestYennefer: (): Promise<BriefingResult | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.YENNEFER_REQUEST),

  onYenneferShortcut: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('shortcut:invoke-yennefer', handler)
    return (): void => {
      ipcRenderer.removeListener('shortcut:invoke-yennefer', handler)
    }
  },

  onAutoHealEvent: (callback: (event: AutoHealEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, healEvent: AutoHealEvent): void =>
      callback(healEvent)
    ipcRenderer.on(IPC_CHANNELS.AUTO_HEAL_EVENT, handler)
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.AUTO_HEAL_EVENT, handler)
    }
  },

  onNotification: (callback: (notif: HelmNotification) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, notif: HelmNotification): void =>
      callback(notif)
    ipcRenderer.on(IPC_CHANNELS.NOTIFICATION, handler)
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION, handler)
    }
  },

  dismissNotification: (id: string): void => {
    ipcRenderer.send(IPC_CHANNELS.DISMISS_NOTIFICATION, id)
  },

  getHealHistory: (): Promise<AutoHealEvent[]> => ipcRenderer.invoke(IPC_CHANNELS.GET_HEAL_HISTORY),

  onBriefingShortcut: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('shortcut:request-briefing', handler)
    return (): void => {
      ipcRenderer.removeListener('shortcut:request-briefing', handler)
    }
  },

  onNetworkState: (callback: (state: NetworkState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: NetworkState): void =>
      callback(state)
    ipcRenderer.on(IPC_CHANNELS.NETWORK_STATE, handler)
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.NETWORK_STATE, handler)
    }
  },

  onFirewallState: (callback: (state: FirewallState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: FirewallState): void =>
      callback(state)
    ipcRenderer.on(IPC_CHANNELS.FIREWALL_STATE, handler)
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.FIREWALL_STATE, handler)
    }
  },

  getFirewallRules: (): Promise<FirewallState> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_FIREWALL_RULES),

  requestSecurityScan: (command: string): Promise<SecurityScanResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.SECURITY_SCAN_REQUEST, command),

  onSecurityScanResult: (callback: (result: SecurityScanResult) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, result: SecurityScanResult): void =>
      callback(result)
    ipcRenderer.on(IPC_CHANNELS.SECURITY_SCAN_RESULT, handler)
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.SECURITY_SCAN_RESULT, handler)
    }
  },

  onSecurityPosture: (callback: (posture: SecurityPosture) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, posture: SecurityPosture): void =>
      callback(posture)
    ipcRenderer.on(IPC_CHANNELS.SECURITY_POSTURE, handler)
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.SECURITY_POSTURE, handler)
    }
  },

  querySnapshots: (limit: number): Promise<DBSnapshot[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_QUERY_SNAPSHOTS, limit),

  queryAlerts: (limit: number): Promise<AutoHealEvent[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_QUERY_ALERTS, limit),

  queryBriefings: (limit: number): Promise<BriefingResult[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_QUERY_BRIEFINGS, limit),

  queryNotifications: (limit: number): Promise<HelmNotification[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_QUERY_NOTIFICATIONS, limit),

  queryLogs: (limit: number): Promise<LogLine[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_QUERY_LOGS, limit),

  clearLogs: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_CLEAR_LOGS),

  getConfig: (): Promise<HelmConfig> => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET),

  saveConfig: (config: HelmConfig): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE, config),

  getCommitHistory: (repoPath: string, limit: number): Promise<GitCommit[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT_HISTORY, repoPath, limit),

  queryPostureHistory: (limit: number): Promise<PostureHistoryEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_QUERY_POSTURE_HISTORY, limit),

  runGitAction: (repoPath: string, action: string): Promise<GitActionResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_ACTION, repoPath, action),

  killProcess: (pid: number, expectedName?: string): Promise<ProcessActionResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROCESS_KILL, pid, expectedName),

  signalProcess: (pid: number, signal: ProcessSignalType): Promise<ProcessActionResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROCESS_SIGNAL, pid, signal),

  killGroup: (
    pids: { pid: number; name: string }[],
    groupName: string
  ): Promise<GroupActionResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROCESS_KILL_GROUP, pids, groupName),

  getTimelineEvents: (limit: number): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.TIMELINE_EVENTS, limit),

  getCCUsage: (): Promise<CCUsageState> => ipcRenderer.invoke(IPC_CHANNELS.CCUSAGE_STATE),

  refreshCCUsage: (): Promise<CCUsageState> => ipcRenderer.invoke(IPC_CHANNELS.CCUSAGE_REFRESH),

  getSkillFeed: (limit: number): Promise<SkillFeed> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILLS_FEED, limit),

  onCCUsageUpdate: (callback: (state: CCUsageState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: CCUsageState): void =>
      callback(state)
    ipcRenderer.on(IPC_CHANNELS.CCUSAGE_STATE, handler)
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.CCUSAGE_STATE, handler)
    }
  },

  openAudioFiles: (): Promise<Array<{ path: string; name: string; sourceUrl: string }>> =>
    ipcRenderer.invoke('dialog:openAudioFile'),

  resolveRadioSource: (source: {
    kind: 'remote' | 'local'
    value: string
    extensionHint?: string
  }): Promise<string> =>
    ipcRenderer.invoke('radio:resolve-source', source),

  getSessionDelta: (): Promise<{
    lastSessionTimestamp: number
    missingWorkspaces: { name: string; type: string; ports: number[] }[]
  } | null> => ipcRenderer.invoke(IPC_CHANNELS.SESSION_DELTA)
}

contextBridge.exposeInMainWorld('helm', api)

export type HelmAPI = typeof api
