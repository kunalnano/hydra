import { ipcMain, type BrowserWindow } from 'electron'
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

const execAsync = promisify(exec)
import { evaluateRules } from '../intelligence/auto-heal'
import type { PreviousState } from '../intelligence/auto-heal'
import { generateBriefing } from '../intelligence/briefing'
import { invokeYennefer } from '../intelligence/yennefer'
import { DEFAULT_RULES } from '../intelligence/rules'
import { getNetworkActivity } from './network'
import { getFirewallRules } from './firewall'
import { getDiskUsage } from './disk'
import { getBatteryStatus } from './battery'
import { runSecurityScan, extractPosture } from '../intelligence/security'
import { getCCUsage } from './ccusage'
import { showDesktopNotification } from '../notifications'
import { isLateNight } from '../intelligence/time-context'
import {
  insertSnapshot,
  insertAlert,
  insertBriefing,
  insertNotification as dbInsertNotification,
  dismissNotification as dbDismissNotification,
  insertSession,
  getLatestSession,
  insertTimelineEvent,
  getTimelineEvents,
  pruneOldTimelineEvents
} from '../db/queries'
import type {
  SystemState,
  AutoHealEvent,
  HydraNotification,
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
let notifications: HydraNotification[] = []
let trayCallback: ((state: SystemState) => void) | null = null
let latestNetwork: NetworkState | null = null
let latestFirewall: FirewallState | null = null
let latestDisk: DiskState | null = null
let latestBattery: BatteryState | null = null
let latestCCUsage: CCUsageState | null = null
// Tiered polling: base tick = 5s
// Tier 1 (every tick = 5s): processes, ports, agents, CPU, memory
// Tier 2 (every 3rd tick = 15s): network
// Tier 3 (every 6th tick = 30s): disk, battery
// Tier 4 (every 12th tick = 60s): git, firewall, snapshots, ccusage
// Tier 5 (every 24th tick = 2min): session snapshots
let networkPollCount = 2 // Start high so first cycle triggers immediately
let diskPollCount = 5
let batteryPollCount = 5
let gitPollCount = 11
let firewallPollCount = 11
let ccusagePollCount = 11
let snapshotPollCount = 0
let sessionPollCount = 0
let previousWorkspaceNames = new Set<string>()
let monitorConfig = loadConfig()

let latestGitRepos: SystemState['gitRepos'] = []

async function collectSystemState(): Promise<SystemState> {
  const [processes, ports] = await Promise.all([
    getProcesses(),
    getPorts()
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
  const availableMemory = await getAvailableMemory()

  const state: SystemState = {
    timestamp: Date.now(),
    processes: processGroups,
    ports,
    agents: [...processAgents, ...fileAgents],
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

export function onStateUpdate(callback: (state: SystemState) => void): void {
  trayCallback = callback
}

export function startMonitoring(mainWindow: BrowserWindow, intervalMs = 5000): void {
  monitorConfig = loadConfig()

  ipcMain.handle(IPC_CHANNELS.GET_INITIAL_STATE, async () => {
    if (!latestState) {
      latestState = await collectSystemState()
    }
    return latestState
  })

  ipcMain.on(IPC_CHANNELS.REQUEST_REFRESH, async () => {
    latestState = await collectSystemState()
    mainWindow.webContents.send(IPC_CHANNELS.SYSTEM_STATE_UPDATE, latestState)
  })

  monitorInterval = setInterval(async () => {
    try {
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
          const notif: HydraNotification = {
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
            showDesktopNotification(`HYDRA: ${notif.title}`, notif.body)
          }
        }
      }
      previousState = { state: latestState, timestamp: Date.now() }
      if (trayCallback) trayCallback(latestState)

      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.SYSTEM_STATE_UPDATE, latestState)
      }

      // Tier 2: Network (every 3rd tick = 15s)
      networkPollCount++
      if (networkPollCount >= 3) {
        networkPollCount = 0
        try {
          latestNetwork = await getNetworkActivity()
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.NETWORK_STATE, latestNetwork)
          }
        } catch (err) {
          console.error('Network monitor failed:', err)
        }
      }

      // Tier 4: Firewall (every 12th tick = 60s)
      firewallPollCount++
      if (firewallPollCount >= 12) {
        firewallPollCount = 0
        try {
          latestFirewall = await getFirewallRules()
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.FIREWALL_STATE, latestFirewall)
          }
        } catch (err) {
          console.error('Firewall monitor failed:', err)
        }
      }

      // Tier 3: Disk (every 6th tick = 30s)
      diskPollCount++
      if (diskPollCount >= 6) {
        diskPollCount = 0
        try {
          latestDisk = await getDiskUsage()
        } catch (err) {
          console.error('Disk monitor failed:', err)
        }
      }

      // Tier 3: Battery (every 6th tick = 30s)
      batteryPollCount++
      if (batteryPollCount >= 6) {
        batteryPollCount = 0
        try {
          latestBattery = await getBatteryStatus()
        } catch (err) {
          console.error('Battery monitor failed:', err)
        }
      }

      // Tier 4: Git status (every 12th tick = 60s)
      gitPollCount++
      if (gitPollCount >= 12) {
        gitPollCount = 0
        try {
          latestGitRepos = await scanForRepos()
        } catch (err) {
          console.error('Git monitor failed:', err)
        }
      }

      // Tier 4: CC Usage (every 12th tick = 60s)
      ccusagePollCount++
      if (ccusagePollCount >= 12) {
        ccusagePollCount = 0
        try {
          latestCCUsage = getCCUsage()
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.CCUSAGE_STATE, latestCCUsage)
          }
        } catch (err) {
          console.error('CC Usage monitor failed:', err)
        }
      }

      // Tier 4: DB snapshot (every 12th tick = 60s)
      snapshotPollCount++
      if (snapshotPollCount >= 12) {
        snapshotPollCount = 0
        try {
          insertSnapshot(latestState)
        } catch (err) {
          console.error('Snapshot DB write failed:', err)
        }
      }

      // Tier 5: Session snapshot (every 24th tick = 2 min)
      sessionPollCount++
      if (sessionPollCount >= 24) {
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
  }, intervalMs)

  // Log monitoring: stream new log lines to renderer
  startLogMonitoring((lines) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.LOG_LINES, lines)
    }
  })

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

  ipcMain.handle(IPC_CHANNELS.YENNEFER_REQUEST, async () => {
    if (!latestState) return null
    return invokeYennefer(latestState)
  })

  ipcMain.handle(IPC_CHANNELS.GET_HEAL_HISTORY, () => healHistory)

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
  previousState = null
  healHistory = []
  notifications = []
  trayCallback = null
  latestNetwork = null
  latestFirewall = null
  latestDisk = null
  latestBattery = null
  latestCCUsage = null
  networkPollCount = 2
  diskPollCount = 5
  batteryPollCount = 5
  gitPollCount = 11
  firewallPollCount = 11
  ccusagePollCount = 11
  snapshotPollCount = 0
  sessionPollCount = 0
  previousWorkspaceNames = new Set()
}
