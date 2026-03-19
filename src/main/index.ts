import { config as dotenvConfig } from 'dotenv'
import { join, basename } from 'path'
import { pathToFileURL } from 'node:url'

// Load .env before anything else reads process.env
dotenvConfig({ path: join(process.cwd(), '.env') })

import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  screen,
  shell,
  globalShortcut,
  ipcMain,
  dialog
} from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startMonitoring, stopMonitoring, onStateUpdate } from './monitors/index'
import { getRepoCommitHistory } from './monitors/git'
import { getDb, closeDb } from './db/index'
import {
  getRecentSnapshots,
  getAlertHistory,
  getRecentBriefings,
  getNotifications,
  getPostureHistory
} from './db/queries'
import { IPC_CHANNELS } from '../shared/types'
import { loadConfig, saveConfig } from './config'
import { getRadioRelayUrl, stopRadioRelayServer } from './radio-relay'
import type { HydraConfig, SystemState } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

// FM radio playback resolves relay URLs asynchronously, so Chromium no longer
// treats the eventual audio.play() call as being inside the original click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

function moveWindowToPrimaryDisplay(window: BrowserWindow): void {
  const workArea = screen.getPrimaryDisplay().workArea
  const bounds = window.getBounds()
  const x = workArea.x + Math.max(0, Math.round((workArea.width - bounds.width) / 2))
  const y = workArea.y + Math.max(0, Math.round((workArea.height - bounds.height) / 2))
  window.setBounds({ ...bounds, x, y })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'HYDRA — Mission Control',
    show: false,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#111827',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js')
    }
  })

  mainWindow.on('ready-to-show', () => {
    moveWindowToPrimaryDisplay(mainWindow!)
    mainWindow!.show()
    mainWindow!.focus()
    mainWindow!.webContents.invalidate()
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[renderer:did-fail-load]', { errorCode, errorDescription, validatedURL })
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer:gone]', details)
  })

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[renderer:preload-error]', { preloadPath, error })
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url)
      if (['https:', 'http:'].includes(parsed.protocol)) {
        shell.openExternal(details.url)
      }
    } catch {
      // Malformed URL — ignore
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  startMonitoring(mainWindow)

  onStateUpdate((state) => {
    if (tray) {
      const health = evaluateSystemHealth(state)
      tray.setImage(createTrayIcon(health))
      const tooltips = {
        green: 'HYDRA — All systems nominal',
        yellow: 'HYDRA — Warning: attention needed',
        red: 'HYDRA — Critical: immediate attention required'
      }
      tray.setToolTip(tooltips[health])
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    stopMonitoring()
  })
}

function createTrayIcon(color: 'green' | 'yellow' | 'red'): Electron.NativeImage {
  const colors = {
    green: { r: 74, g: 222, b: 128 },
    yellow: { r: 251, g: 191, b: 36 },
    red: { r: 248, g: 113, b: 113 }
  }
  const c = colors[color]
  const size = 16
  const canvas = Buffer.alloc(size * size * 4, 0)
  const cx = 8
  const cy = 8
  const radius = 6

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= radius * radius) {
        const idx = (y * size + x) * 4
        canvas[idx] = c.r
        canvas[idx + 1] = c.g
        canvas[idx + 2] = c.b
        canvas[idx + 3] = 255
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size })
}

function evaluateSystemHealth(state: SystemState): 'green' | 'yellow' | 'red' {
  if (state.cpu.usage > 95 || state.memory.usagePercent > 95) return 'red'
  if (state.disk && state.disk.maxUsagePercent >= 95) return 'red'
  if (state.battery && !state.battery.charging && state.battery.percent <= 10) return 'red'
  if (state.cpu.usage > 80 || state.memory.usagePercent > 85) return 'yellow'
  if (state.disk && state.disk.maxUsagePercent >= 85) return 'yellow'
  if (state.battery && !state.battery.charging && state.battery.percent <= 20) return 'yellow'
  if (state.agents.some((a) => a.status === 'waiting')) return 'yellow'
  return 'green'
}

function createTray(): void {
  tray = new Tray(createTrayIcon('green'))
  tray.setToolTip('HYDRA — All systems nominal')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show HYDRA',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        } else {
          createWindow()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Refresh Now',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send(IPC_CHANNELS.REQUEST_REFRESH)
        }
      }
    },
    { type: 'separator' },
    { role: 'quit', label: 'Quit HYDRA' }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
    }
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.hydra.mission-control')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Log active config
  const config = loadConfig()
  console.log('[config] LM Studio URL:', config.lmStudioUrl || process.env.LM_STUDIO_URL || 'http://localhost:1234')

  // Initialize SQLite database
  getDb()

  // DB query IPC handlers
  ipcMain.handle(IPC_CHANNELS.DB_QUERY_SNAPSHOTS, (_event, limit: number) =>
    getRecentSnapshots(limit)
  )
  ipcMain.handle(IPC_CHANNELS.DB_QUERY_ALERTS, (_event, limit: number) => getAlertHistory(limit))
  ipcMain.handle(IPC_CHANNELS.DB_QUERY_BRIEFINGS, (_event, limit: number) =>
    getRecentBriefings(limit)
  )
  ipcMain.handle(IPC_CHANNELS.DB_QUERY_NOTIFICATIONS, (_event, limit: number) =>
    getNotifications(limit)
  )

  ipcMain.handle(IPC_CHANNELS.DB_QUERY_POSTURE_HISTORY, (_event, limit: number) =>
    getPostureHistory(limit)
  )

  // Config IPC handler
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, () => loadConfig())
  ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE, (_event, config: HydraConfig) => saveConfig(config))

  // Git commit history IPC handler
  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT_HISTORY, (_event, repoPath: string, limit: number) =>
    getRepoCommitHistory(repoPath, limit)
  )

  // Audio file picker for FM Radio local library
  ipcMain.handle('dialog:openAudioFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose audio files',
      filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac'] }],
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled) return []
    return result.filePaths.map((fp) => ({
      path: fp,
      name: basename(fp),
      sourceUrl: pathToFileURL(fp).toString()
    }))
  })

  ipcMain.handle(
    'radio:resolve-source',
    (
      _event,
      source: { kind: 'remote' | 'local'; value: string; extensionHint?: string }
    ) => getRadioRelayUrl(source)
  )

  createTray()
  createWindow()

  globalShortcut.register('CommandOrControl+B', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('shortcut:request-briefing')
    }
  })

  globalShortcut.register('CommandOrControl+Y', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('shortcut:invoke-yennefer')
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Keep app running in tray
})

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
  stopMonitoring()
  void stopRadioRelayServer()
  closeDb()
})
