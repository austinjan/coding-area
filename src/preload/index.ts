import { contextBridge, ipcRenderer } from 'electron'
import {
  AgentType,
  CreatePtyRequest,
  PersistedWorkspaceState,
  PtyStatusEvent
} from '../shared/types'

export interface CodingAreaAPI {
  createPty: (req: CreatePtyRequest) => Promise<{ ok: boolean; error?: string; pid?: number }>
  writePty: (sessionId: string, data: string) => void
  resizePty: (sessionId: string, cols: number, rows: number) => void
  killPty: (sessionId: string) => Promise<boolean>
  launchAgent: (
    sessionId: string,
    agentType: AgentType,
    customArgs?: string
  ) => Promise<boolean>
  loadWorkspace: () => Promise<PersistedWorkspaceState | null>
  saveWorkspace: (state: PersistedWorkspaceState) => Promise<boolean>
  getDefaultCwd: () => Promise<string>
  selectDirectory: () => Promise<string | null>
  onPtyData: (
    callback: (payload: { sessionId: string; data: string }) => void
  ) => () => void
  onPtyStatus: (callback: (payload: PtyStatusEvent) => void) => () => void
  onPtyExit: (
    callback: (payload: { sessionId: string; exitCode: number }) => void
  ) => () => void
  onFocusSession: (callback: (sessionId: string) => void) => () => void
}

const codingAreaApi: CodingAreaAPI = {
  createPty: (req) => ipcRenderer.invoke('pty:create', req),
  writePty: (sessionId, data) => ipcRenderer.send('pty:write', { sessionId, data }),
  resizePty: (sessionId, cols, rows) =>
    ipcRenderer.send('pty:resize', { sessionId, cols, rows }),
  killPty: (sessionId) => ipcRenderer.invoke('pty:kill', sessionId),
  launchAgent: (sessionId, agentType, customArgs) =>
    ipcRenderer.invoke('pty:launch-agent', { sessionId, agentType, customArgs }),
  loadWorkspace: () => ipcRenderer.invoke('workspace:load'),
  saveWorkspace: (state) => ipcRenderer.invoke('workspace:save', state),
  getDefaultCwd: () => ipcRenderer.invoke('workspace:default-cwd'),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  onPtyData: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { sessionId: string; data: string }
    ): void => callback(payload)
    ipcRenderer.on('pty:data', listener)
    return () => ipcRenderer.removeListener('pty:data', listener)
  },
  onPtyStatus: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: PtyStatusEvent
    ): void => callback(payload)
    ipcRenderer.on('pty:status', listener)
    return () => ipcRenderer.removeListener('pty:status', listener)
  },
  onPtyExit: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { sessionId: string; exitCode: number }
    ): void => callback(payload)
    ipcRenderer.on('pty:exit', listener)
    return () => ipcRenderer.removeListener('pty:exit', listener)
  },
  onFocusSession: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      sessionId: string
    ): void => callback(sessionId)
    ipcRenderer.on('pty:focus-session', listener)
    return () => ipcRenderer.removeListener('pty:focus-session', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('codingArea', codingAreaApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.codingArea = codingAreaApi
}
