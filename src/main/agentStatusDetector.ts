import { AgentStatus, AgentType } from '../shared/types'

/**
 * Strips ANSI escape sequences (CSI, OSC, SGR, cursor positioning) so we can
 * inspect human-readable text output from coding agent TUIs (Codex, Claude, AGY).
 */
export function stripAnsi(input: string): string {
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g
  // eslint-disable-next-line no-control-regex
  const oscRegex = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g
  return input
    .replace(oscRegex, '')
    .replace(ansiRegex, '')
    .replace(/\r/g, '')
}

export interface StatusDetectionResult {
  status: AgentStatus
  reason: string
  snippet: string
}

const PERMISSION_PATTERNS: RegExp[] = [
  /do you want to proceed\??/i,
  /allow\s+(?:claude|codex|agy|tool|command|bash|edit|write|execution)/i,
  /approve\s+(?:this\s+)?(?:command|tool|action|change|patch|edit)/i,
  /permission\s+(?:required|requested|needed)/i,
  /\[y\/n\]|\(y\/n\)|\[Y\/n\]|\(Y\/n\)|\[y\/N\]|\(y\/N\)/,
  /1\.\s*Yes\b[\s\S]{0,120}2\.\s*No\b/i,
  /Yes,\s*and\s*don't\s*ask\s*again/i,
  /Run\s+command\?/i,
  /Apply\s+changes\?/i,
  /Would you like to run this command\?/i,
  /requires your approval/i,
  /Grant permission/i,
  /請確認是否執行|是否允許|需要權限|是否繼續/
]

const COMPLETED_PATTERNS: RegExp[] = [
  /\btask\s+(?:completed|finished|done)\b/i,
  /\bcompleted\s+successfully\b/i,
  /✓\s*(?:Done|Completed|Finished|All tasks complete)/i,
  /✔\s*(?:Done|Completed|Finished)/i,
  /Total cost:\s*\$/i,
  /已完成所有|任務完成|執行完畢/
]

const WAITING_INPUT_PATTERNS: RegExp[] = [
  /\bwaiting for (?:your )?(?:input|response|instructions)\b/i,
  /\bwhat would you like to do next\??/i,
  /\bhow can I help you\??/i,
  /\benter your prompt\b/i,
  /\btype a message\b/i,
  /(?:^|\n)\s*(?:codex|claude|agy)>\s*$/i,
  /(?:^|\n)\s*╭─.*[\s\S]*╰─>\s*$/,
  /(?:^|\n)\s*[❯›>]\s*$/
]

export class AgentOutputMonitor {
  private recentBuffer = ''
  private status: AgentStatus = 'starting'
  private idleTimer: NodeJS.Timeout | null = null
  private hadSignificantOutput = false
  private lastNotificationSignature = ''

  constructor(
    _sessionId: string,
    private readonly agentType: AgentType,
    private readonly onStatusDetected: (
      result: StatusDetectionResult,
      shouldNotify: boolean
    ) => void
  ) {}

  public getStatus(): AgentStatus {
    return this.status
  }

  public onUserInput(data: string): void {
    // When user presses Enter or submits input, agent transitions to running
    if (data.includes('\r') || data.includes('\n')) {
      this.hadSignificantOutput = false
      this.setStatus('running', 'User submitted input', '', false)
    } else if (this.status === 'waiting_permission') {
      // Single keystroke (e.g. 'y', 'n', '1', Enter) in TUI permission selector
      this.setStatus('running', 'User responded to prompt', '', false)
    }
  }

  public onData(rawChunk: string): void {
    const hasBell = rawChunk.includes('\x07')
    const cleaned = stripAnsi(rawChunk)

    if (cleaned.trim().length > 4) {
      this.hadSignificantOutput = true
    }

    this.recentBuffer = (this.recentBuffer + cleaned).slice(-2400)
    const tail = this.recentBuffer.slice(-900)
    const lastLines = tail
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(-6)
      .join(' | ')

    // Immediate check for explicit permission prompts
    for (const pattern of PERMISSION_PATTERNS) {
      if (pattern.test(tail)) {
        this.clearIdleTimer()
        this.setStatus(
          'waiting_permission',
          'Agent is asking for tool/command permission',
          lastLines || 'Permission approval required',
          true
        )
        return
      }
    }

    // Immediate check for explicit completion markers
    for (const pattern of COMPLETED_PATTERNS) {
      if (pattern.test(tail)) {
        this.clearIdleTimer()
        this.setStatus(
          'completed',
          'Agent reported task completion',
          lastLines || 'Task finished',
          true
        )
        return
      }
    }

    // If terminal rings the bell (\x07), Coding Agents often use it to signal attention needed
    if (hasBell && this.status === 'running') {
      this.clearIdleTimer()
      this.setStatus(
        'waiting_input',
        'Terminal bell triggered by agent',
        lastLines || 'Agent requested attention',
        true
      )
      return
    }

    // Otherwise while streaming output, mark as running and reset idle detector
    if (this.status === 'starting' && cleaned.trim().length > 0) {
      this.setStatus('running', 'Agent initialized', lastLines, false)
    }

    this.scheduleIdleCheck()
  }

  public markExited(exitCode?: number): void {
    this.clearIdleTimer()
    this.status = 'exited'
    this.onStatusDetected(
      {
        status: 'exited',
        reason: `Process exited (${exitCode ?? 0})`,
        snippet: `Process exited with code ${exitCode ?? 0}`
      },
      false
    )
  }

  public dispose(): void {
    this.clearIdleTimer()
  }

  private scheduleIdleCheck(): void {
    this.clearIdleTimer()
    // After 2.5 seconds of silence following output, inspect the tail for input prompts or completion
    this.idleTimer = setTimeout(() => {
      const tail = this.recentBuffer.slice(-800)
      const lastLines = tail
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(-4)
        .join(' | ')

      for (const pattern of PERMISSION_PATTERNS) {
        if (pattern.test(tail)) {
          this.setStatus(
            'waiting_permission',
            'Agent is waiting for permission approval',
            lastLines,
            true
          )
          return
        }
      }

      for (const pattern of COMPLETED_PATTERNS) {
        if (pattern.test(tail)) {
          this.setStatus('completed', 'Agent finished task', lastLines, true)
          return
        }
      }

      for (const pattern of WAITING_INPUT_PATTERNS) {
        if (pattern.test(tail)) {
          const nextStatus: AgentStatus = this.hadSignificantOutput ? 'completed' : 'waiting_input'
          const reason = this.hadSignificantOutput
            ? 'Agent finished turn and is waiting for next prompt'
            : 'Agent is ready for user input'
          this.hadSignificantOutput = false
          this.setStatus(nextStatus, reason, lastLines || 'Waiting for prompt', true)
          return
        }
      }

      if (this.hadSignificantOutput && this.agentType !== 'shell') {
        this.hadSignificantOutput = false
        this.setStatus(
          'waiting_input',
          'Agent output settled — ready for input',
          lastLines || 'Ready for input',
          true
        )
      }
    }, 2500)
  }

  private setStatus(
    nextStatus: AgentStatus,
    reason: string,
    snippet: string,
    notifyCandidate: boolean
  ): void {
    const signature = `${nextStatus}:${snippet.slice(-120)}`
    const statusChanged = this.status !== nextStatus
    this.status = nextStatus

    const shouldNotify =
      notifyCandidate &&
      (statusChanged || this.lastNotificationSignature !== signature) &&
      (nextStatus === 'waiting_permission' ||
        nextStatus === 'waiting_input' ||
        nextStatus === 'completed')

    if (shouldNotify) {
      this.lastNotificationSignature = signature
    }

    if (statusChanged || shouldNotify) {
      this.onStatusDetected({ status: nextStatus, reason, snippet }, shouldNotify)
    }
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }
}
