import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import type {
  HiveConfig,
  HiveSpawnRequest,
  HiveSpawnResult,
  HiveSessionInfo
} from '../../shared/types'

const execFileAsync = promisify(execFile)

// In-memory session registry
const sessions = new Map<string, HiveSessionInfo>()

function generateSessionId(role: string): string {
  return `hive-${role}-${Date.now().toString(36)}`
}

async function tmuxExists(): Promise<boolean> {
  try {
    await execFileAsync('which', ['tmux'])
    return true
  } catch {
    return false
  }
}

async function claudeExists(binPath: string): Promise<boolean> {
  // Check explicit path first, then PATH
  if (existsSync(binPath)) return true
  try {
    await execFileAsync('which', [binPath])
    return true
  } catch {
    return false
  }
}

export async function spawnHiveAgent(
  request: HiveSpawnRequest,
  config: HiveConfig
): Promise<HiveSpawnResult> {
  if (!await tmuxExists()) {
    return { success: false, error: 'tmux is not installed or not in PATH' }
  }

  const claudeBin = config.claudeBinPath
  if (!await claudeExists(claudeBin)) {
    return { success: false, error: `Claude CLI not found at: ${claudeBin}` }
  }

  const role = request.role
  const model = request.model ?? config.roles.find((r) => r.name === role)?.model ?? config.defaultModel
  const sessionId = generateSessionId(role)
  const tmuxSession = config.tmuxSessionPrefix
  const tmuxWindow = `${role}-${sessionId.slice(-6)}`

  try {
    // Check if tmux session exists, create if not
    try {
      await execFileAsync('tmux', ['has-session', '-t', tmuxSession])
    } catch {
      // Session doesn't exist, create it
      await execFileAsync('tmux', [
        'new-session', '-d', '-s', tmuxSession, '-n', tmuxWindow, '-c', request.workingDir
      ])
      // Send claude command
      const claudeCmd = `${claudeBin} --model ${model}`
      await execFileAsync('tmux', ['send-keys', '-t', `${tmuxSession}:${tmuxWindow}`, claudeCmd, 'Enter'])

      const session: HiveSessionInfo = {
        id: sessionId,
        role,
        model,
        tmuxSession,
        tmuxWindow,
        workingDir: request.workingDir,
        startedAt: Date.now(),
        status: 'running'
      }
      sessions.set(sessionId, session)

      // Send objective if provided
      if (request.objective) {
        // Small delay to let claude start
        await new Promise((r) => setTimeout(r, 2000))
        await execFileAsync('tmux', [
          'send-keys', '-t', `${tmuxSession}:${tmuxWindow}`, request.objective, 'Enter'
        ])
      }

      return { success: true, session }
    }

    // Session exists, create new window
    await execFileAsync('tmux', [
      'new-window', '-t', tmuxSession, '-n', tmuxWindow, '-c', request.workingDir
    ])

    const claudeCmd = `${claudeBin} --model ${model}`
    await execFileAsync('tmux', ['send-keys', '-t', `${tmuxSession}:${tmuxWindow}`, claudeCmd, 'Enter'])

    const session: HiveSessionInfo = {
      id: sessionId,
      role,
      model,
      tmuxSession,
      tmuxWindow,
      workingDir: request.workingDir,
      startedAt: Date.now(),
      status: 'running'
    }
    sessions.set(sessionId, session)

    // Send objective if provided
    if (request.objective) {
      await new Promise((r) => setTimeout(r, 2000))
      await execFileAsync('tmux', [
        'send-keys', '-t', `${tmuxSession}:${tmuxWindow}`, request.objective, 'Enter'
      ])
    }

    return { success: true, session }
  } catch (err) {
    return { success: false, error: `Failed to spawn agent: ${err}` }
  }
}

export async function killHiveSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
  const session = sessions.get(sessionId)
  if (!session) {
    return { success: false, error: `Session not found: ${sessionId}` }
  }

  try {
    await execFileAsync('tmux', [
      'kill-window', '-t', `${session.tmuxSession}:${session.tmuxWindow}`
    ])
    sessions.delete(sessionId)
    return { success: true }
  } catch (err) {
    // Window might already be gone
    sessions.delete(sessionId)
    return { success: true }
  }
}

export async function listHiveSessions(prefix: string): Promise<HiveSessionInfo[]> {
  try {
    await execFileAsync('tmux', ['has-session', '-t', prefix])
  } catch {
    // No tmux session with this prefix
    return Array.from(sessions.values())
  }

  try {
    const { stdout } = await execFileAsync('tmux', [
      'list-windows', '-t', prefix, '-F', '#{window_name}|#{pane_pid}|#{pane_current_path}'
    ])

    const tmuxWindows = new Map<string, { pid: number; cwd: string }>()
    for (const line of stdout.trim().split('\n')) {
      if (!line) continue
      const [name, pid, cwd] = line.split('|')
      tmuxWindows.set(name, { pid: parseInt(pid, 10), cwd: cwd || '' })
    }

    // Update existing sessions with PID info from tmux
    for (const session of sessions.values()) {
      const tmuxInfo = tmuxWindows.get(session.tmuxWindow)
      if (tmuxInfo) {
        session.pid = tmuxInfo.pid
        session.status = 'running'
      } else {
        session.status = 'dead'
      }
    }

    // Discover sessions we don't know about (e.g. after restart)
    for (const [windowName, info] of tmuxWindows) {
      const known = Array.from(sessions.values()).find((s) => s.tmuxWindow === windowName)
      if (!known && windowName !== 'control') {
        // Try to parse role from window name (format: role-id or just role name)
        const role = windowName.split('-')[0]
        const discoveredSession: HiveSessionInfo = {
          id: `discovered-${windowName}-${Date.now().toString(36)}`,
          role,
          model: 'sonnet',
          tmuxSession: prefix,
          tmuxWindow: windowName,
          pid: info.pid,
          workingDir: info.cwd,
          startedAt: Date.now(),
          status: 'running'
        }
        sessions.set(discoveredSession.id, discoveredSession)
      }
    }
  } catch {
    // tmux list failed
  }

  return Array.from(sessions.values())
}

export async function sendToHiveAgent(
  sessionId: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const session = sessions.get(sessionId)
  if (!session) {
    return { success: false, error: `Session not found: ${sessionId}` }
  }

  try {
    await execFileAsync('tmux', [
      'send-keys', '-t', `${session.tmuxSession}:${session.tmuxWindow}`, message, 'Enter'
    ])
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to send message: ${err}` }
  }
}

export async function attachToHiveSession(
  tmuxSession: string,
  tmuxWindow: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Open Terminal.app with tmux attach command
    const script = `tell application "Terminal"
      activate
      do script "tmux select-window -t ${tmuxSession}:${tmuxWindow} && tmux attach -t ${tmuxSession}"
    end tell`
    await execFileAsync('osascript', ['-e', script])
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to attach: ${err}` }
  }
}

export function getSessionRegistry(): Map<string, HiveSessionInfo> {
  return sessions
}

export function clearSessionRegistry(): void {
  sessions.clear()
}
