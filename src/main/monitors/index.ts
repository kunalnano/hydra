import { ipcMain, type BrowserWindow } from 'electron'
import { getProcesses, groupProcesses } from './processes'
import { getPorts } from './ports'
import { detectAgents } from './agents'
import { scanForRepos } from './git'
import { startLogMonitoring, stopLogMonitoring, getLogSources } from './logs'
import { cpus, freemem, totalmem } from 'os'
import { evaluateRules } from '../intelligence/auto-heal'
import type { PreviousState } from '../intelligence/auto-heal'
import { generateBriefing } from '../intelligence/briefing'
import { DEFAULT_RULES } from '../intelligence/rules'
import { getNetworkActivity } from './network'
import { getFirewallRules } from './firewall'
import { runSecurityScan, extractPosture } from '../intelligence/security'
import { showDesktopNotification } from '../notifications'
import {
  insertSnapshot,
  insertAlert,
  insertBriefing,
  insertNotification as dbInsertNotification,
  dismissNotification as dbDismissNotification
} from '../db/queries'
import type {
  SystemState,
  AutoHealEvent,
  HydraNotification,
  NetworkState,
  FirewallState,
  SecurityScanResult
} from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/types'

let monitorInterval: ReturnType<typeof setInterval> | null = null
let latestState: SystemState | null = null
let previousState: PreviousState | null = null
let healHistory: AutoHealEvent[] = []
let notifications: HydraNotification[] = []
let trayCallback: ((state: SystemState) => void) | null = null
let latestNetwork: NetworkState | null = null
let latestFirewall: FirewallState | null = null
let firewallPollCount = 0
let snapshotPollCount = 0

async function collectSystemState(): Promise<SystemState> {
  const [processes, ports, gitRepos] = await Promise.all([
    getProcesses(),
    getPorts(),
    scanForRepos()
  ])

  const processGroups = groupProcesses(processes)
  const agents = detectAgents(processes)

  for (const group of processGroups) {
    const groupPids = new Set(group.processes.map((p) => p.pid))
    group.ports = ports
      .filter((p) => groupPids.has(p.pid) && p.state === 'LISTEN')
      .map((p) => p.port)
  }

  const cpuInfo = cpus()
  const totalMemory = totalmem()
  const freeMemory = freemem()

  return {
    timestamp: Date.now(),
    processes: processGroups,
    ports,
    agents,
    gitRepos,
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
      used: totalMemory - freeMemory,
      free: freeMemory,
      usagePercent: ((totalMemory - freeMemory) / totalMemory) * 100
    }
  }
}

export function onStateUpdate(callback: (state: SystemState) => void): void {
  trayCallback = callback
}

export function startMonitoring(mainWindow: BrowserWindow, intervalMs = 2000): void {
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

      // Network monitoring
      try {
        latestNetwork = await getNetworkActivity()
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.NETWORK_STATE, latestNetwork)
        }
      } catch (err) {
        console.error('Network monitor failed:', err)
      }

      // Firewall monitoring (every 15th cycle = ~30s)
      firewallPollCount++
      if (firewallPollCount >= 15) {
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

      // DB snapshot persistence (every 15th cycle = ~30s)
      snapshotPollCount++
      if (snapshotPollCount >= 15) {
        snapshotPollCount = 0
        try {
          insertSnapshot(latestState)
        } catch (err) {
          console.error('Snapshot DB write failed:', err)
        }
      }
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
  ipcMain.removeHandler(IPC_CHANNELS.GET_HEAL_HISTORY)
  ipcMain.removeAllListeners(IPC_CHANNELS.DISMISS_NOTIFICATION)
  ipcMain.removeHandler(IPC_CHANNELS.GET_FIREWALL_RULES)
  ipcMain.removeHandler(IPC_CHANNELS.SECURITY_SCAN_REQUEST)
  previousState = null
  healHistory = []
  notifications = []
  trayCallback = null
  latestNetwork = null
  latestFirewall = null
  firewallPollCount = 0
  snapshotPollCount = 0
}
