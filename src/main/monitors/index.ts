import { ipcMain, type BrowserWindow } from 'electron'
import { setTimeout as delay } from 'timers/promises'
import { getProcesses, groupProcesses } from './processes'
import { getPorts } from './ports'
import { detectAgents } from './agents'
import { loadExternalAgents, loadExternalAgentTimelineEvents } from './agent-feeds'
import { scanForRepos, runGitAction } from './git'
import { startLogMonitoring, stopLogMonitoring, getLogSources } from './logs'
import { cpus, freemem, totalmem } from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { isMacOS } from '../platform'
import { killProcess, sendProcessSignal, killGroup } from '../actions'
import { loadConfig } from '../config'
import { decorateAgentsWithHive, resolveHiveConfig } from '../hive/index'

const execAsync = promisify(exec)
import { evaluateRules } from '../intelligence/auto-heal'
import type { PreviousState } from '../intelligence/auto-heal'
import { generateBriefing } from '../intelligence/briefing'
import { healLmStudioConnection } from '../intelligence/lmstudio'
import { invokeYennefer } from '../intelligence/yennefer'
import { DEFAULT_RULES } from '../intelligence/rules'
import { getNetworkActivity } from './network'
import { getFirewallRules } from './firewall'
import { getDiskUsage } from './disk'
import { getBatteryStatus } from './battery'
import { runSecurityScan, extractPosture } from '../intelligence/security'
import { getCCUsage } from './ccusage'
import { buildMonitorTickThresholds, resolveMonitorInterval } from './schedule'
import { showDesktopNotification } from '../notifications'
import { isLateNight } from '../intelligence/time-context'
import {
  insertSnapshot,
  insertAlert,
  insertBriefing,
  insertNotification as dbInsertNotification,
  dismissNotification as dbDismissNotification,
  insertLogLines,
  insertSession,
  getLatestSession,
  insertTimelineEvent,
  getTimelineEvents,
  pruneOldTimelineEvents,
  pruneOldSnapshots,
  pruneOldLogLines,
  getAlertHistory,
  getRecentLogLines
} from '../db/queries'
import type {
  SystemState,
  AutoHealEvent,
  HelmNotification,
  NetworkState,
  FirewallState,
  DiskState,
  BatteryState,
  CCUsageState,
  ProcessSignalType
} from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/types'

/**
 * Get real available memory on macOS using vm_stat.
 * os.freemem() only reports truly free pages, ignoring purgeable/cached memory
 * that macOS would release under pressure — leading to misleading 99% usage.
 */
async function getAvailableMemory(): Promise<number> {
  const totalMemory = totalmem()
  if (!isMacOS()) {
    return freemem()
  }
  try {
    const { stdout } = await execAsync('vm_stat', { timeout: 3000 })
    // vm_stat reports in pages (usually 16384 bytes on Apple Silicon, 4096 on Intel)
    const pageSizeMatch = stdout.match(/page size of (\d+) bytes/)
    const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 16384

    const free = stdout.match(/Pages free:\s+(\d+)/)
    const inactive = stdout.match(/Pages inactive:\s+(\d+)/)
    const purgeable = stdout.match(/Pages purgeable:\s+(\d+)/)
    const speculative = stdout.match(/Pages speculative:\s+(\d+)/)

    const freePages =
      (free ? parseInt(free[1], 10) : 0) +
      (inactive ? parseInt(inactive[1], 10) : 0) +
      (purgeable ? parseInt(purgeable[1], 10) : 0) +
      (speculative ? parseInt(speculative[1], 10) : 0)

    return Math.min(freePages * pageSize, totalMemory)
  } catch {
    return freemem()
  }
}

let monitorInterval: ReturnType<typeof setInterval> | null = null
let latestState: SystemState | null = null
let previousState: PreviousState | null = null
let healHistory: AutoHealEvent[] = []
let notifications: HelmNotification[] = []
let trayCallback: ((state: SystemState) => void) | null = null
let latestNetwork: NetworkState | null = null
let latestFirewall: FirewallState | null = null
let latestDisk: DiskState | null = null
let latestBattery: BatteryState | null = null
let latestCCUsage: CCUsageState | null = null
let previousWorkspaceNames = new Set<string>()
let monitorConfig = loadConfig()
let pollThresholds = buildMonitorTickThresholds(monitorConfig)
let networkPollCount = 0
let diskPollCount = 0
let batteryPollCount = 0
let gitPollCount = 0
let firewallPollCount = 0
let ccusagePollCount = 0
let snapshotPollCount = 0
let sessionPollCount = 0

let latestGitRepos: SystemState['gitRepos'] = []

function refreshMonitorConfig(): void {
  monitorConfig = loadConfig()
  pollThresholds = buildMonitorTickThresholds(monitorConfig)
}

function resetTieredPollCounters(): void {
  // Start slow monitors "warm" so the first loop fills those panels quickly.
  networkPollCount = Math.max(0, pollThresholds.network - 1)
  diskPollCount = Math.max(0, pollThresholds.disk - 1)
  batteryPollCount = Math.max(0, pollThresholds.battery - 1)
  gitPollCount = Math.max(0, pollThresholds.git - 1)
  firewallPollCount = Math.max(0, pollThresholds.firewall - 1)
  ccusagePollCount = Math.max(0, pollThresholds.ccusage - 1)
  snapshotPollCount = 0
  sessionPollCount = 0
}

resetTieredPollCounters()

async function withTimeout<T>(label: string, operation: Promise<T>, fallback: T, ms = 4000): Promise<T> {
  try {
    return await Promise.race([
      operation,
      delay(ms).then(() => {
        throw new Error(`${label} timed out after ${ms}ms`)
      })
    ])
  } catch (error) {
    console.error(`[monitor:${label}]`, error)
    return fallback
  }
}

function refreshAndBroadcastCCUsage(
  mainWindow: BrowserWindow,
  options: { forceLive?: boolean } = {}
): CCUsageState {
  latestCCUsage = getCCUsage({ forceLive: options.forceLive })
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.CCUSAGE_STATE, latestCCUsage)
  }
  return latestCCUsage
}

async function collectSystemState(): Promise<SystemState> {
  const [processes, ports, availableMemory] = await Promise.all([
    withTimeout('processes', getProcesses(), []),
    withTimeout('ports', getPorts(), []),
    withTimeout('memory', getAvailableMemory(), freemem())
  ])

  const processGroups = groupProcesses(processes)
  const processAgents = detectAgents(processes)
  const fileAgents = loadExternalAgents(monitorConfig)

  for (const group of processGroups) {
    const groupPids = new Set(group.processes.map((p) => p.pid))
    group.ports = ports
      .filter((p) => groupPids.has(p.pid) && p.state === 'LISTEN')
      .map((p) => p.port)
  }

  const cpuInfo = cpus()
  const totalMemory = totalmem()

  const agents = [...processAgents, ...fileAgents]

  // Decorate agents with HIVE session info
  const hiveConfig = resolveHiveConfig(monitorConfig.hive)
  decorateAgentsWithHive(agents, hiveConfig.tmuxSessionPrefix)

  const state: SystemState = {
    timestamp: Date.now(),
    processes: processGroups,
    ports,
    agents,
    gitRepos: latestGitRepos,
    cpu: {
      usage:
        cpuInfo.reduce((acc, cpu) => {
          const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
          const idle = cpu.times.idle
          return acc + ((total - idle) / total) * 100
        }, 0) / cpuInfo.length,
      cores: cpuInfo.length
    },
    memory: {
      total: totalMemory,
      used: totalMemory - availableMemory,
      free: availableMemory,
      usagePercent: ((totalMemory - availableMemory) / totalMemory) * 100
    },
    isLateNight: isLateNight()
  }

  if (latestDisk) state.disk = latestDisk
  if (latestBattery) state.battery = latestBattery
  if (latestNetwork) state.network = latestNetwork
  if (latestFirewall) state.firewall = latestFirewall

  return state
}

function ingestExternalAgentTimelineEvents(): void {
  const events = loadExternalAgentTimelineEvents(monitorConfig)
  for (const event of events) {
    try {
      insertTimelineEvent(event)
    } catch {
      /* ignore */
    }
  }
}

export function getLatestState(): SystemState | null {
  return latestState
}

export function onStateUpdate(callback: (state: SystemState) => void): void {
  trayCallback = callback
}

export function startMonitoring(mainWindow: BrowserWindow, intervalMs?: number): void {
  refreshMonitorConfig()
  resetTieredPollCounters()
  const loopIntervalMs = intervalMs ?? resolveMonitorInterval(monitorConfig)

  ipcMain.handle(IPC_CHANNELS.GET_INITIAL_STATE, async () => {
    if (!latestState) {
      latestState = await collectSystemState()
    }
    return latestState
  })

  ipcMain.on(IPC_CHANNELS.REQUEST_REFRESH, async () => {
    refreshMonitorConfig()
    try {
      latestGitRepos = await scanForRepos(monitorConfig.gitRepoPaths)
    } catch (err) {
      console.error('Git monitor failed:', err)
    }
    latestState = await collectSystemState()
    mainWindow.webContents.send(IPC_CHANNELS.SYSTEM_STATE_UPDATE, latestState)
    refreshAndBroadcastCCUsage(mainWindow, { forceLive: true })
  })

  monitorInterval = setInterval(async () => {
    try {
      refreshMonitorConfig()
      latestState = await collectSystemState()
      ingestExternalAgentTimelineEvents()

      // Auto-heal evaluation
      const events = evaluateRules(latestState, previousState, DEFAULT_RULES)
      if (events.length > 0) {
        healHistory = [...healHistory.slice(-100), ...events]
        for (const event of events) {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.AUTO_HEAL_EVENT, event)
          }
          try {
            insertAlert(event)
          } catch {
            /* DB write failed — continue */
          }
          const notif: HelmNotification = {
            id: `${event.timestamp}-${event.rule}`,
            title: event.rule.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            body: event.message,
            level: event.rule.includes('high') ? 'warning' : 'critical',
            timestamp: event.timestamp,
            dismissed: false
          }
          notifications.push(notif)
          try {
            dbInsertNotification(notif)
          } catch {
            /* DB write failed — continue */
          }
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, notif)
          }
          if (notif.level === 'critical') {
            showDesktopNotification(`HELM: ${notif.title}`, notif.body)
          }
        }
      }
      previousState = { state: latestState, timestamp: Date.now() }
      if (trayCallback) trayCallback(latestState)

      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.SYSTEM_STATE_UPDATE, latestState)
      }

      // Tier 2: Network
      networkPollCount++
      if (networkPollCount >= pollThresholds.network) {
        networkPollCount = 0
        try {
          latestNetwork = await getNetworkActivity()
          if (latestState) {
            latestState = { ...latestState, network: latestNetwork }
          }
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.NETWORK_STATE, latestNetwork)
            if (latestState) {
              mainWindow.webContents.send(IPC_CHANNELS.SYSTEM_STATE_UPDATE, latestState)
            }
          }
        } catch (err) {
          console.error('Network monitor failed:', err)
        }
      }

      // Tier 4: Firewall
      firewallPollCount++
      if (firewallPollCount >= pollThresholds.firewall) {
        firewallPollCount = 0
        try {
          latestFirewall = await getFirewallRules()
          if (latestState) {
            latestState = { ...latestState, firewall: latestFirewall }
          }
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.FIREWALL_STATE, latestFirewall)
          }
        } catch (err) {
          console.error('Firewall monitor failed:', err)
        }
      }

      // Tier 3: Disk
      diskPollCount++
      if (diskPollCount >= pollThresholds.disk) {
        diskPollCount = 0
        try {
          latestDisk = await getDiskUsage()
        } catch (err) {
          console.error('Disk monitor failed:', err)
        }
      }

      // Tier 3: Battery
      batteryPollCount++
      if (batteryPollCount >= pollThresholds.battery) {
        batteryPollCount = 0
        try {
          latestBattery = await getBatteryStatus()
        } catch (err) {
          console.error('Battery monitor failed:', err)
        }
      }

      // Tier 4: Git status
      gitPollCount++
      if (gitPollCount >= pollThresholds.git) {
        gitPollCount = 0
        try {
          latestGitRepos = await scanForRepos(monitorConfig.gitRepoPaths)
        } catch (err) {
          console.error('Git monitor failed:', err)
        }
      }

      // Tier 4: CC Usage
      ccusagePollCount++
      if (ccusagePollCount >= pollThresholds.ccusage) {
        ccusagePollCount = 0
        try {
          refreshAndBroadcastCCUsage(mainWindow)
        } catch (err) {
          console.error('CC Usage monitor failed:', err)
        }
      }

      // Tier 4: DB snapshot
      snapshotPollCount++
      if (snapshotPollCount >= pollThresholds.snapshot) {
        snapshotPollCount = 0
        try {
          insertSnapshot(latestState)
          pruneOldSnapshots(1000)
        } catch (err) {
          console.error('Snapshot DB write failed:', err)
        }
      }

      // Tier 5: Session snapshot
      sessionPollCount++
      if (sessionPollCount >= pollThresholds.session) {
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
    } catch (err) {
      console.error('Monitor cycle failed:', err)
    }
  }, loopIntervalMs)

  // Log monitoring: stream new log lines to renderer
  const hasPersistedLogs = getRecentLogLines(1).length > 0
  startLogMonitoring((lines, kind) => {
    if (kind === 'tail' || !hasPersistedLogs) {
      try {
        insertLogLines(lines)
        pruneOldLogLines(10000)
      } catch {
        /* DB write failed — continue */
      }
    }
    if (!mainWindow.isDestroyed() && (kind === 'tail' || !hasPersistedLogs)) {
      mainWindow.webContents.send(IPC_CHANNELS.LOG_LINES, lines)
    }
  }, monitorConfig)

  ipcMain.handle(IPC_CHANNELS.LOG_SOURCES, () => getLogSources())

  ipcMain.handle(IPC_CHANNELS.BRIEFING_REQUEST, async () => {
    if (!latestState) return null
    const result = await generateBriefing(latestState)
    try {
      insertBriefing(result)
    } catch {
      /* DB write failed — continue */
    }
    return result
  })

  ipcMain.handle(IPC_CHANNELS.LM_STUDIO_HEAL, async () => {
    return healLmStudioConnection({ persist: true })
  })

  ipcMain.handle(IPC_CHANNELS.YENNEFER_REQUEST, async () => {
    if (!latestState) return null
    const result = await invokeYennefer(latestState)
    try {
      insertBriefing(result)
    } catch {
      /* DB write failed — continue */
    }
    return result
  })

  ipcMain.handle(IPC_CHANNELS.GET_HEAL_HISTORY, () => getAlertHistory(100))

  ipcMain.on(IPC_CHANNELS.DISMISS_NOTIFICATION, (_event, id: string) => {
    const notif = notifications.find((n) => n.id === id)
    if (notif) notif.dismissed = true
    try {
      dbDismissNotification(id)
    } catch {
      /* DB write failed — continue */
    }
  })

  ipcMain.handle(IPC_CHANNELS.GET_FIREWALL_RULES, async () => {
    if (!latestFirewall) {
      latestFirewall = await getFirewallRules()
    }
    return latestFirewall
  })

  ipcMain.handle(IPC_CHANNELS.GIT_ACTION, async (_event, repoPath: string, action: string) => {
    return runGitAction(repoPath, action)
  })

  ipcMain.handle(IPC_CHANNELS.SECURITY_SCAN_REQUEST, async (_event, command: string) => {
    const result = await runSecurityScan(command)
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.SECURITY_SCAN_RESULT, result)

      // After a successful survey scan, send posture update to renderer
      if (command === 'survey' && result.status === 'complete') {
        const posture = extractPosture()
        if (posture) {
          mainWindow.webContents.send(IPC_CHANNELS.SECURITY_POSTURE, posture)
        }
      }
    }
    return result
  })

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

  ipcMain.handle(IPC_CHANNELS.TIMELINE_EVENTS, async (_event, limit: number) => {
    return getTimelineEvents(limit)
  })

  ipcMain.handle(IPC_CHANNELS.CCUSAGE_STATE, () => {
    if (!latestCCUsage) {
      latestCCUsage = getCCUsage()
    }
    return latestCCUsage
  })

  ipcMain.handle(IPC_CHANNELS.CCUSAGE_REFRESH, () => {
    return refreshAndBroadcastCCUsage(mainWindow, { forceLive: true })
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
}

export function stopMonitoring(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval)
    monitorInterval = null
  }
  stopLogMonitoring()
  ipcMain.removeHandler(IPC_CHANNELS.GET_INITIAL_STATE)
  ipcMain.removeHandler(IPC_CHANNELS.LOG_SOURCES)
  ipcMain.removeAllListeners(IPC_CHANNELS.REQUEST_REFRESH)
  ipcMain.removeHandler(IPC_CHANNELS.BRIEFING_REQUEST)
  ipcMain.removeHandler(IPC_CHANNELS.LM_STUDIO_HEAL)
  ipcMain.removeHandler(IPC_CHANNELS.YENNEFER_REQUEST)
  ipcMain.removeHandler(IPC_CHANNELS.GET_HEAL_HISTORY)
  ipcMain.removeAllListeners(IPC_CHANNELS.DISMISS_NOTIFICATION)
  ipcMain.removeHandler(IPC_CHANNELS.GET_FIREWALL_RULES)
  ipcMain.removeHandler(IPC_CHANNELS.GIT_ACTION)
  ipcMain.removeHandler(IPC_CHANNELS.SECURITY_SCAN_REQUEST)
  ipcMain.removeHandler(IPC_CHANNELS.PROCESS_KILL)
  ipcMain.removeHandler(IPC_CHANNELS.PROCESS_SIGNAL)
  ipcMain.removeHandler(IPC_CHANNELS.PROCESS_KILL_GROUP)
  ipcMain.removeHandler(IPC_CHANNELS.TIMELINE_EVENTS)
  ipcMain.removeHandler(IPC_CHANNELS.SESSION_DELTA)
  ipcMain.removeHandler(IPC_CHANNELS.CCUSAGE_STATE)
  ipcMain.removeHandler(IPC_CHANNELS.CCUSAGE_REFRESH)
  previousState = null
  healHistory = []
  notifications = []
  trayCallback = null
  latestNetwork = null
  latestFirewall = null
  latestDisk = null
  latestBattery = null
  latestCCUsage = null
  previousWorkspaceNames = new Set()
  resetTieredPollCounters()
}
