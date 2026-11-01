import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import { AgentStatus } from '@shared/types'

export interface TermWrapCallbacks {
  onData: (data: string) => void
  onResize: (cols: number, rows: number) => void
  onOscCwdChange?: (cwd: string) => void
  onOscNotification?: (status: AgentStatus, message: string) => void
  onBell?: () => void
}

/**
 * Inspired by wavetermdev/waveterm's `TermWrap` and warpdotdev/warp's OSC & shell integration:
 * Encapsulates an xterm.js instance with:
 * - Official `@xterm/addon-serialize` for exact ANSI + color state persistence
 * - Official `@xterm/addon-unicode11` for CJK (Chinese/Japanese/Korean) double-byte width
 * - Official `@xterm/addon-webgl` with automatic DOM fallback
 * - Official `@xterm/addon-clipboard` for OSC 52 clipboard integration
 * - Standard OSC 7 (CWD), OSC 9 / OSC 99 / OSC 777 (Desktop notifications), and OSC 133 (FinalTerm / Warp prompt boundary markers)
 */
export class TermWrap {
  public readonly terminal: Terminal
  public readonly fitAddon: FitAddon
  public readonly serializeAddon: SerializeAddon
  public readonly searchAddon: SearchAddon

  private resizeObserver: ResizeObserver | null = null
  private disposed = false

  constructor(
    _sessionId: string,
    private readonly container: HTMLElement,
    private readonly callbacks: TermWrapCallbacks
  ) {
    this.terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13.5,
      lineHeight: 1.24,
      fontFamily:
        '"Cascadia Mono", "JetBrains Mono", "Fira Code", "Consolas", "Microsoft YaHei UI", "PingFang SC", "Noto Sans Mono CJK SC", monospace',
      allowProposedApi: true,
      scrollback: 10000,
      macOptionIsMeta: true,
      theme: {
        background: '#0b0f19',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        cursorAccent: '#0b0f19',
        selectionBackground: 'rgba(56, 189, 248, 0.25)',
        black: '#1e293b',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#f1f5f9',
        brightBlack: '#64748b',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff'
      }
    })

    this.fitAddon = new FitAddon()
    this.serializeAddon = new SerializeAddon()
    this.searchAddon = new SearchAddon()
    const unicode11Addon = new Unicode11Addon()
    const webLinksAddon = new WebLinksAddon()
    const clipboardAddon = new ClipboardAddon()

    this.terminal.loadAddon(this.fitAddon)
    this.terminal.loadAddon(this.serializeAddon)
    this.terminal.loadAddon(this.searchAddon)
    this.terminal.loadAddon(unicode11Addon)
    this.terminal.loadAddon(webLinksAddon)
    this.terminal.loadAddon(clipboardAddon)

    // Activate Unicode 11 for accurate CJK double-byte character width
    this.terminal.unicode.activeVersion = '11'

    this.terminal.open(this.container)

    // Only attempt WebGL rendering if the container is visibly laid out in the DOM
    if (this.container.clientWidth > 0 && this.container.clientHeight > 0) {
      try {
        const webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => {
          try {
            webglAddon.dispose()
          } catch {
            // ignore
          }
        })
        this.terminal.loadAddon(webglAddon)
      } catch {
        // Fallback to standard canvas/DOM renderer automatically
      }
    }

    this.registerProtocolHandlers()
    this.setupResizeObserver()
  }

  private registerProtocolHandlers(): void {
    // Forward keyboard/IME input to node-pty
    this.terminal.onData((data) => {
      if (!this.disposed) {
        this.callbacks.onData(data)
      }
    })

    // Native terminal bell listener
    this.terminal.onBell(() => {
      this.callbacks.onBell?.()
    })

    // OSC 7: Current Working Directory tracking (used by both Warp and WaveTerm)
    // Format: \x1b]7;file://hostname/path\x07
    this.terminal.parser.registerOscHandler(7, (data) => {
      try {
        if (data.startsWith('file://')) {
          const url = new URL(data)
          let pathname = decodeURIComponent(url.pathname)
          // Normalize Windows drive paths like /C:/Users/... -> C:\Users\...
          if (/^\/[a-zA-Z]:/.test(pathname)) {
            pathname = pathname.slice(1).replace(/\//g, '\\')
          }
          if (pathname) {
            this.callbacks.onOscCwdChange?.(pathname)
          }
        } else if (data.trim().length > 0) {
          this.callbacks.onOscCwdChange?.(data.trim())
        }
      } catch {
        // ignore malformed OSC 7
      }
      return true
    })

    // OSC 9: iTerm2 / ConEmu / Coding Agent notification protocol (\x1b]9;message\x07)
    this.terminal.parser.registerOscHandler(9, (data) => {
      const msg = data.trim()
      if (msg && !msg.startsWith('4;')) {
        const isPerm = /permission|approve|allow|confirm/i.test(msg)
        this.callbacks.onOscNotification?.(
          isPerm ? 'waiting_permission' : 'completed',
          msg
        )
      }
      return true
    })

    // OSC 777: rxvt / desktop notification protocol (\x1b]777;notify;title;body\x07)
    this.terminal.parser.registerOscHandler(777, (data) => {
      const parts = data.split(';')
      if (parts[0] === 'notify') {
        const title = parts[1] || ''
        const body = parts.slice(2).join(';') || title
        const combined = `${title}: ${body}`.trim()
        const isPerm = /permission|approve|allow|confirm/i.test(combined)
        this.callbacks.onOscNotification?.(
          isPerm ? 'waiting_permission' : 'completed',
          combined
        )
      }
      return true
    })

    // OSC 133: FinalTerm / Warp / Wave semantic shell prompt & command execution markers
    // A = Prompt start, B = Command start, C = Command executed, D;exitCode = Command finished
    this.terminal.parser.registerOscHandler(133, (data) => {
      const code = data.split(';')[0]
      if (code === 'D') {
        this.callbacks.onOscNotification?.(
          'completed',
          'Command execution finished (OSC 133;D)'
        )
      } else if (code === 'A') {
        this.callbacks.onOscNotification?.(
          'waiting_input',
          'Shell prompt ready for input (OSC 133;A)'
        )
      }
      return true
    })
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.disposed || this.container.clientWidth === 0 || this.container.clientHeight === 0) {
        return
      }
      this.fitAndSync()
    })
    this.resizeObserver.observe(this.container)
  }

  public fitAndSync(): void {
    if (this.disposed) return
    try {
      this.fitAddon.fit()
      if (this.terminal.cols && this.terminal.rows) {
        this.callbacks.onResize(this.terminal.cols, this.terminal.rows)
      }
    } catch {
      // ignore if hidden
    }
  }

  public write(data: string): void {
    if (!this.disposed) {
      this.terminal.write(data)
    }
  }

  public restoreSerializedState(serialized: string): void {
    if (!serialized || this.disposed) return
    this.terminal.writeln(
      '\x1b[38;5;244m╭─── Restored Terminal State (@xterm/addon-serialize) ───────────────────╮\x1b[0m'
    )
    this.terminal.write(serialized)
    this.terminal.writeln(
      '\r\n\x1b[38;5;244m╰─── Re-initializing Coding Agent Session ───────────────────────────────╯\x1b[0m\r\n'
    )
  }

  /**
   * Serializes the live terminal buffer (including ANSI colors, formatting, and scrollback)
   * using `@xterm/addon-serialize`, just like WaveTerm.
   */
  public serializeState(): string {
    if (this.disposed) return ''
    try {
      return this.serializeAddon.serialize({ scrollback: 1500 })
    } catch {
      return ''
    }
  }

  public focus(): void {
    if (!this.disposed) {
      this.terminal.focus()
    }
  }

  public findNext(query: string): void {
    if (!this.disposed && query) {
      this.searchAddon.findNext(query)
    }
  }

  public dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.resizeObserver?.disconnect()
    try {
      this.terminal.dispose()
    } catch {
      // ignore internal xterm addon disposal race when container was not yet visible
    }
  }
}
