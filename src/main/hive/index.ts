import { ipcMain, type BrowserWindow } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { IPC_CHANNELS } from '../../shared/types'
import type {
  HiveConfig,
  HiveRoleTemplate,
  HiveSpawnRequest,
  HiveSessionInfo
} from '../../shared/types'
import {
  spawnHiveAgent,
  killHiveSession,
  listHiveSessions,
  sendToHiveAgent,
  attachToHiveSession,
  getSessionRegistry
} from './spawner'
import { readSharedContext, writeSharedContext } from './context'

const BUILT_IN_ROLES: HiveRoleTemplate[] = [
  {
    name: 'architect',
    displayName: 'Architect',
    model: 'opus',
    claudeMdPath: join(__dirname, 'hive', 'roles', 'architect.md'),
    description: 'System design, planning, and architectural decisions'
  },
  {
    name: 'builder',
    displayName: 'Builder',
    model: 'sonnet',
    claudeMdPath: join(__dirname, 'hive', 'roles', 'builder.md'),
    description: 'Implementation, code, tests, and prototypes'
  },
  {
    name: 'analyst',
    displayName: 'Analyst',
    model: 'sonnet',
    claudeMdPath: join(__dirname, 'hive', 'roles', 'analyst.md'),
    description: 'Research, data analysis, and investigation'
  },
  {
    name: 'ops',
    displayName: 'Ops',
    model: 'sonnet',
    claudeMdPath: join(__dirname, 'hive', 'roles', 'ops.md'),
    description: 'Infrastructure, automation, CI/CD, and reliability'
  },
  {
    name: 'strategist',
    displayName: 'Strategist',
    model: 'opus',
    claudeMdPath: join(__dirname, 'hive', 'roles', 'strategist.md'),
    description: 'Business strategy, customer success, and domain work'
  }
]

export function getDefaultHiveConfig(): HiveConfig {
  return {
    enabled: false,
    roles: BUILT_IN_ROLES,
    defaultModel: 'sonnet',
    sharedContextPath: join(homedir(), '.config', 'helm', 'hive', 'shared', 'context.md'),
    tmuxSessionPrefix: 'helm-hive',
    claudeBinPath: 'claude',
    idleReclaimMinutes: 30
  }
}

export function resolveHiveConfig(userConfig?: Partial<HiveConfig>): HiveConfig {
  const defaults = getDefaultHiveConfig()
  if (!userConfig) return defaults
  return {
    ...defaults,
    ...userConfig,
    roles: userConfig.roles ?? defaults.roles
  }
}

export function setupHiveIPC(mainWindow: BrowserWindow, hiveConfig: HiveConfig): void {
  ipcMain.handle(IPC_CHANNELS.HIVE_SPAWN, async (_event, request: HiveSpawnRequest) => {
    return spawnHiveAgent(request, hiveConfig)
  })

  ipcMain.handle(IPC_CHANNELS.HIVE_KILL_SESSION, async (_event, sessionId: string) => {
    const result = await killHiveSession(sessionId)
    if (result.success && !mainWindow.isDestroyed()) {
      const sessions = await listHiveSessions(hiveConfig.tmuxSessionPrefix)
      mainWindow.webContents.send(IPC_CHANNELS.HIVE_SESSION_UPDATE, sessions)
    }
    return result
  })

  ipcMain.handle(IPC_CHANNELS.HIVE_LIST_SESSIONS, async () => {
    return listHiveSessions(hiveConfig.tmuxSessionPrefix)
  })

  ipcMain.handle(IPC_CHANNELS.HIVE_SEND_MESSAGE, async (_event, sessionId: string, message: string) => {
    return sendToHiveAgent(sessionId, message)
  })

  ipcMain.handle(IPC_CHANNELS.HIVE_UPDATE_CONTEXT, async (_event, objective: string, sections?: Record<string, string>) => {
    writeSharedContext(hiveConfig.sharedContextPath, objective, sections)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.HIVE_GET_CONTEXT, async () => {
    return readSharedContext(hiveConfig.sharedContextPath)
  })

  ipcMain.handle(IPC_CHANNELS.HIVE_ATTACH, async (_event, sessionId: string) => {
    const session = getSessionRegistry().get(sessionId)
    if (!session) return { success: false, error: 'Session not found' }
    return attachToHiveSession(session.tmuxSession, session.tmuxWindow)
  })
}

export function teardownHive(): void {
  ipcMain.removeHandler(IPC_CHANNELS.HIVE_SPAWN)
  ipcMain.removeHandler(IPC_CHANNELS.HIVE_KILL_SESSION)
  ipcMain.removeHandler(IPC_CHANNELS.HIVE_LIST_SESSIONS)
  ipcMain.removeHandler(IPC_CHANNELS.HIVE_SEND_MESSAGE)
  ipcMain.removeHandler(IPC_CHANNELS.HIVE_UPDATE_CONTEXT)
  ipcMain.removeHandler(IPC_CHANNELS.HIVE_GET_CONTEXT)
  ipcMain.removeHandler(IPC_CHANNELS.HIVE_ATTACH)
}

/**
 * Cross-reference detected agents with active HIVE sessions.
 * Call this during monitor cycle to decorate AgentInfo entries.
 */
export function decorateAgentsWithHive(
  agents: { pid?: number; tmuxSession?: string; hiveSessionId?: string; hiveRole?: string }[],
  hivePrefix: string
): void {
  const registry = getSessionRegistry()
  if (registry.size === 0) return

  const sessionsByPid = new Map<number, HiveSessionInfo>()
  const sessionsByTmux = new Map<string, HiveSessionInfo>()

  for (const session of registry.values()) {
    if (session.pid) sessionsByPid.set(session.pid, session)
    sessionsByTmux.set(`${session.tmuxSession}:${session.tmuxWindow}`, session)
  }

  for (const agent of agents) {
    // Match by PID
    if (agent.pid && sessionsByPid.has(agent.pid)) {
      const session = sessionsByPid.get(agent.pid)!
      agent.hiveSessionId = session.id
      agent.hiveRole = session.role
      continue
    }
    // Match by tmux session name
    if (agent.tmuxSession) {
      for (const [, session] of sessionsByTmux) {
        if (agent.tmuxSession === session.tmuxSession || agent.tmuxSession.includes(hivePrefix)) {
          agent.hiveSessionId = session.id
          agent.hiveRole = session.role
          break
        }
      }
    }
  }
}
