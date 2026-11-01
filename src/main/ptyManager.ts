import * as os from 'os'
import * as fs from 'fs'
import * as pty from 'node-pty'
import { BrowserWindow, Notification } from 'electron'
import {
  AGENT_PROFILES,
  AgentType,
  CreatePtyRequest,
  PtyStatusEvent
} from '../shared/types'
import { AgentOutputMonitor } from './agentStatusDetector'

interface ManagedPtySession {
  id: string
  title: string
  agentType: AgentType
  cwd: string
  ptyProcess: pty.IPty
  monitor: AgentOutputMonitor
  scrollbackBuffer: string
}

const MAX_SCROLLBACK_CHARS = 120_000

export class PtyManager {
  private sessions = new Map<string, ManagedPtySession>()
  private desktopNotifyEnabled = true

  constructor(private readonly getMainWindow: () => BrowserWindow | null) {}

  public setDesktopNotifyEnabled(enabled: boolean): void {
    this.desktopNotifyEnabled = enabled
  }

  public createSession(req: CreatePtyRequest): { ok: boolean; error?: string; pid?: number } {
    // Clean up existing session with same ID if any
    if (this.sessions.has(req.id)) {
      this.killSession(req.id)
    }

    const validCwd = req.cwd && fs.existsSync(req.cwd) ? req.cwd : os.homedir()
    const isWin = os.platform() === 'win32'
    const defaultShell = isWin
      ? 'powershell.exe'
      : process.env.SHELL || '/bin/zsh'

    const shellArgs = isWin ? ['-NoLogo'] : ['-l']

    // Sanitize environment variables for node-pty on Windows (remove empty-key vars like '=C:' that crash native ConPTY)
    const cleanEnv: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (k && !k.startsWith('=') && typeof v === 'string') {
        cleanEnv[k] = v
      }
    }
    const env: Record<string, string> = {
      ...cleanEnv,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '3',
      LANG: cleanEnv.LANG || 'en_US.UTF-8',
      LC_ALL: cleanEnv.LC_ALL || 'en_US.UTF-8',
      PYTHONIOENCODING: 'utf-8'
    }

    let ptyProcess: pty.IPty
    try {
      ptyProcess = pty.spawn(defaultShell, shellArgs, {
        name: 'xterm-256color',
        cols: Math.max(20, Math.floor(req.cols || 100)),
        rows: Math.max(8, Math.floor(req.rows || 30)),
        cwd: validCwd,
        env,
        useConpty: false
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return { ok: false, error: msg }
    }

    const monitor = new AgentOutputMonitor(req.id, req.agentType, (result, shouldNotify) => {
      const payload: PtyStatusEvent = {
        sessionId: req.id,
        status: result.status,
        reason: result.reason,
        snippet: result.snippet
      }
      this.sendToRenderer('pty:status', payload)

      if (shouldNotify && this.desktopNotifyEnabled && Notification.isSupported()) {
        const profile = AGENT_PROFILES[req.agentType]
        const titleMap: Record<string, string> = {
          waiting_permission: `Permission Required · ${req.title}`,
          waiting_input: `Waiting for Input · ${req.title}`,
          completed: `Task Finished · ${req.title}`
        }
        const notifTitle = titleMap[result.status] || `${profile.name} (${req.title})`
        const notification = new Notification({
          title: notifTitle,
          body: result.snippet || result.reason,
          silent: false
        })
        notification.on('click', () => {
          const win = this.getMainWindow()
          if (win) {
            if (win.isMinimized()) win.restore()
            win.focus()
            win.webContents.send('pty:focus-session', req.id)
          }
        })
        notification.show()
      }
    })

    const session: ManagedPtySession = {
      id: req.id,
      title: req.title,
      agentType: req.agentType,
      cwd: validCwd,
      ptyProcess,
      monitor,
      scrollbackBuffer: ''
    }

    this.sessions.set(req.id, session)

    ptyProcess.onData((data) => {
      session.scrollbackBuffer = (session.scrollbackBuffer + data).slice(-MAX_SCROLLBACK_CHARS)
      this.sendToRenderer('pty:data', { sessionId: req.id, data })
      monitor.onData(data)
    })

    ptyProcess.onExit(({ exitCode }) => {
      monitor.markExited(exitCode)
      this.sendToRenderer('pty:exit', { sessionId: req.id, exitCode })
    })

    // Configure UTF-8 codepage on Windows and auto-launch the target coding agent CLI
    setTimeout(() => {
      if (!this.sessions.has(req.id)) return

      const launchCmd = this.buildAgentCommand(req)
      if (isWin) {
        // Set UTF-8 output encoding for double-byte characters (Chinese/Japanese/Korean) and box-drawing TUI glyphs
        const utf8Init =
          '[Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false); chcp 65001 > $null'
        if (launchCmd) {
          const baseBin = AGENT_PROFILES[req.agentType]?.command || launchCmd.split(' ')[0]
          const safeCheck = `if (Get-Command "${baseBin}" -ErrorAction SilentlyContinue) { ${launchCmd} } else { Write-Host "[Coding Area] '${baseBin}' CLI is not installed on this machine. Shell is ready — or use 'claude' / install '${baseBin}'." -ForegroundColor Yellow }`
          ptyProcess.write(`${utf8Init}; clear; ${safeCheck}\r`)
        } else {
          ptyProcess.write(`${utf8Init}; clear\r`)
        }
      } else if (launchCmd) {
        const baseBin = AGENT_PROFILES[req.agentType]?.command || launchCmd.split(' ')[0]
        ptyProcess.write(
          `if command -v ${baseBin} >/dev/null 2>&1; then ${launchCmd}; else printf "\\033[33m[Coding Area] '${baseBin}' CLI is not installed on this machine. Shell is ready.\\033[0m\\n"; fi\r`
        )
      }
    }, 180)

    return { ok: true, pid: ptyProcess.pid }
  }

  public write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    session.monitor.onUserInput(data)
    session.ptyProcess.write(data)
    return true
  }

  public resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    try {
      session.ptyProcess.resize(Math.max(10, cols), Math.max(4, rows))
      return true
    } catch {
      return false
    }
  }

  public launchAgentCommand(sessionId: string, agentType: AgentType, customArgs?: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    const profile = AGENT_PROFILES[agentType]
    if (!profile.command) return false
    const args = customArgs ? customArgs.trim() : profile.defaultArgs.join(' ')
    const fullCmd = args ? `${profile.command} ${args}` : profile.command
    session.monitor.onUserInput('\r')
    session.ptyProcess.write(`${fullCmd}\r`)
    return true
  }

  public getScrollback(sessionId: string): string {
    return this.sessions.get(sessionId)?.scrollbackBuffer || ''
  }

  public killSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    session.monitor.dispose()
    try {
      session.ptyProcess.kill()
    } catch {
      // ignore if already dead
    }
    this.sessions.delete(sessionId)
    return true
  }

  public killAll(): void {
    for (const id of this.sessions.keys()) {
      this.killSession(id)
    }
  }

  private buildAgentCommand(req: CreatePtyRequest): string | null {
    if (!req.autoStartAgent || req.agentType === 'shell') {
      return null
    }
    const profile = AGENT_PROFILES[req.agentType]
    if (!profile || !profile.command) {
      return null
    }

    const baseArgs = req.useResumeFlag
      ? profile.resumeArgs
      : profile.defaultArgs
    const extra = req.customArgs ? req.customArgs.trim() : ''
    const combinedArgs = [...baseArgs, ...(extra ? [extra] : [])].join(' ').trim()
    return combinedArgs ? `${profile.command} ${combinedArgs}` : profile.command
  }

  private sendToRenderer(channel: string, payload: unknown): void {
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}
