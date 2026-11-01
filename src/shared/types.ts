export type AgentType = 'codex' | 'claude' | 'agy' | 'shell'

export type AgentStatus =
  | 'starting'
  | 'running'
  | 'waiting_permission'
  | 'waiting_input'
  | 'completed'
  | 'exited'

export type LayoutMode = 'tabs' | 'split-2' | 'split-3' | 'grid-4'

export interface AgentProfile {
  id: AgentType
  name: string
  subtitle: string
  command: string
  defaultArgs: string[]
  resumeArgs: string[]
  accentColor: string
  badgeText: string
  description: string
}

export const AGENT_PROFILES: Record<AgentType, AgentProfile> = {
  codex: {
    id: 'codex',
    name: 'Codex CLI',
    subtitle: 'OpenAI Coding Agent',
    command: 'codex',
    defaultArgs: [],
    resumeArgs: [],
    accentColor: '#10b981',
    badgeText: 'CDX',
    description: 'OpenAI Codex terminal coding assistant with full TUI and diff approvals.'
  },
  claude: {
    id: 'claude',
    name: 'Claude Code',
    subtitle: 'Anthropic CLI Agent',
    command: 'claude',
    defaultArgs: [],
    resumeArgs: ['--continue'],
    accentColor: '#f97316',
    badgeText: 'CLD',
    description: 'Anthropic Claude Code CLI with interactive tool permission prompts and TUI.'
  },
  agy: {
    id: 'agy',
    name: 'AGY CLI',
    subtitle: 'Antigravity Agent',
    command: 'agy',
    defaultArgs: [],
    resumeArgs: [],
    accentColor: '#3b82f6',
    badgeText: 'AGY',
    description: 'Google Antigravity agentic CLI for autonomous multi-step coding.'
  },
  shell: {
    id: 'shell',
    name: 'System Shell',
    subtitle: 'PowerShell / Bash',
    command: '',
    defaultArgs: [],
    resumeArgs: [],
    accentColor: '#94a3b8',
    badgeText: 'SH',
    description: 'Interactive system terminal with full UTF-8, CJK, and ANSI color support.'
  }
}

export interface TerminalSessionMetadata {
  id: string
  title: string
  agentType: AgentType
  cwd: string
  customArgs?: string
  autoStartAgent: boolean
  useResumeFlag?: boolean
  createdAt: number
  lastStatus?: AgentStatus
  lastPromptSnippet?: string
  scrollback?: string
}

export interface NotificationRecord {
  id: string
  sessionId: string
  sessionTitle: string
  agentType: AgentType
  status: 'waiting_permission' | 'waiting_input' | 'completed'
  message: string
  snippet: string
  timestamp: number
  acknowledged: boolean
}

export interface PersistedWorkspaceState {
  version: number
  layoutMode: LayoutMode
  activeSessionId: string | null
  visiblePaneIds: string[]
  soundEnabled: boolean
  desktopNotifyEnabled: boolean
  sessions: TerminalSessionMetadata[]
}

export interface CreatePtyRequest {
  id: string
  title: string
  agentType: AgentType
  cwd: string
  cols: number
  rows: number
  customArgs?: string
  autoStartAgent: boolean
  useResumeFlag?: boolean
}

export interface PtyStatusEvent {
  sessionId: string
  status: AgentStatus
  reason?: string
  snippet?: string
  exitCode?: number
}
