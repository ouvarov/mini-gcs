import fs from 'node:fs'
import { join } from 'node:path'

import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { IPC_CHANNELS, type LinkConfig, type TelemetryFrame } from '@shared/ipc'
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'

import { createMavlinkLink } from './link/mavlinkLink'

const APP_USER_MODEL_ID = 'dev.uvarov.minigcs'
const WINDOW_WIDTH_PX = 1400
const WINDOW_HEIGHT_PX = 900
const WINDOW_BACKGROUND_COLOR = '#0b0f14'
const TELEMETRY_BATCH_INTERVAL_MS = 16
const RECORDINGS_DIRECTORY_NAME = 'recordings'

const mavlinkLink = createMavlinkLink()
let pendingTelemetryFrames: TelemetryFrame[] = []

const broadcastToAllWindows = (channel: string, payload: unknown): void => {
  for (const browserWindow of BrowserWindow.getAllWindows()) {
    if (!browserWindow.isDestroyed()) browserWindow.webContents.send(channel, payload)
  }
}

// One IPC message per interval instead of one per packet.
mavlinkLink.subscribe('frame', (frame) => {
  pendingTelemetryFrames.push(frame)
})
setInterval(() => {
  if (pendingTelemetryFrames.length === 0) return
  broadcastToAllWindows(IPC_CHANNELS.telemetryBatch, {
    sentAtEpochMs: Date.now(),
    frames: pendingTelemetryFrames,
  })
  pendingTelemetryFrames = []
}, TELEMETRY_BATCH_INTERVAL_MS)

mavlinkLink.subscribe('status', (linkStatus) =>
  broadcastToAllWindows(IPC_CHANNELS.linkStatus, linkStatus)
)
mavlinkLink.subscribe('recording', (recordingStatus) =>
  broadcastToAllWindows(IPC_CHANNELS.recordingStatus, recordingStatus)
)
mavlinkLink.subscribe('log', (logLine) => broadcastToAllWindows(IPC_CHANNELS.logLine, logLine))

const ensureRecordingsDirectory = (): string => {
  const directory = join(app.getPath('userData'), RECORDINGS_DIRECTORY_NAME)
  fs.mkdirSync(directory, { recursive: true })
  return directory
}

const recordingFileName = (): string => `${new Date().toISOString().replace(/[:.]/g, '-')}.tlog`

ipcMain.handle(IPC_CHANNELS.linkConnect, (_event, linkConfig: LinkConfig) =>
  mavlinkLink.connect(linkConfig)
)
ipcMain.handle(IPC_CHANNELS.linkDisconnect, () => mavlinkLink.disconnect())
ipcMain.handle(IPC_CHANNELS.recordingStart, () =>
  mavlinkLink.startRecording(join(ensureRecordingsDirectory(), recordingFileName()))
)
ipcMain.handle(IPC_CHANNELS.recordingStop, () => mavlinkLink.stopRecording())
ipcMain.handle(IPC_CHANNELS.pickTlogFile, async () => {
  const openDialogResult = await dialog.showOpenDialog({
    title: 'Open telemetry log',
    defaultPath: ensureRecordingsDirectory(),
    filters: [{ name: 'MAVLink telemetry log', extensions: ['tlog'] }],
    properties: ['openFile'],
  })
  return openDialogResult.canceled ? null : openDialogResult.filePaths[0]
})

const createMainWindow = (): void => {
  const mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH_PX,
    height: WINDOW_HEIGHT_PX,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: WINDOW_BACKGROUND_COLOR,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((openWindowRequest) => {
    void shell.openExternal(openWindowRequest.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId(APP_USER_MODEL_ID)

  app.on('browser-window-created', (_event, createdWindow) => {
    optimizer.watchWindowShortcuts(createdWindow)
  })

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  mavlinkLink.stopRecording()
  void mavlinkLink.disconnect()
  if (process.platform !== 'darwin') app.quit()
})
