import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { PtyManager } from './ptyManager'
import { SessionStore } from './sessionStore'
import {
  AgentType,
  CreatePtyRequest,
  PersistedWorkspaceState
} from '../shared/types'

let mainWindow: BrowserWindow | null = null
const sessionStore = new SessionStore()
const ptyManager = new PtyManager(() => mainWindow)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: true,
    backgroundColor: '#090d16',
    autoHideMenuBar: true,
    title: 'Coding Area — Multi-Agent Workspace',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return
    mainWindow.show()
    mainWindow.focus()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.codingarea.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC Handlers for PTY Management
  ipcMain.handle('pty:create', (_event, req: CreatePtyRequest) => {
    return ptyManager.createSession(req)
  })

  ipcMain.on('pty:write', (_event, payload: { sessionId: string; data: string }) => {
    ptyManager.write(payload.sessionId, payload.data)
  })

  ipcMain.on(
    'pty:resize',
    (_event, payload: { sessionId: string; cols: number; rows: number }) => {
      ptyManager.resize(payload.sessionId, payload.cols, payload.rows)
    }
  )

  ipcMain.handle('pty:kill', (_event, sessionId: string) => {
    return ptyManager.killSession(sessionId)
  })

  ipcMain.handle(
    'pty:launch-agent',
    (
      _event,
      payload: { sessionId: string; agentType: AgentType; customArgs?: string }
    ) => {
      return ptyManager.launchAgentCommand(
        payload.sessionId,
        payload.agentType,
        payload.customArgs
      )
    }
  )

  // IPC Handlers for Workspace Persistence
  ipcMain.handle('workspace:load', () => {
    return sessionStore.load()
  })

  ipcMain.handle('workspace:save', (_event, state: PersistedWorkspaceState) => {
    ptyManager.setDesktopNotifyEnabled(state.desktopNotifyEnabled)
    // Enrich each session with the latest live scrollback buffer from PtyManager if available
    const enriched: PersistedWorkspaceState = {
      ...state,
      sessions: state.sessions.map((s) => {
        const liveScrollback = ptyManager.getScrollback(s.id)
        return {
          ...s,
          scrollback: liveScrollback || s.scrollback || ''
        }
      })
    }
    return sessionStore.save(enriched)
  })

  ipcMain.handle('workspace:default-cwd', () => {
    return process.cwd()
  })

  ipcMain.handle('dialog:select-directory', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Working Directory for Coding Agent'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  ptyManager.killAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
