import React, { useEffect, useRef, useState } from 'react'
import '@xterm/xterm/css/xterm.css'
import {
  AGENT_PROFILES,
  AgentStatus,
  AgentType,
  TerminalSessionMetadata
} from '@shared/types'
import {
  Play,
  RotateCcw,
  Trash2,
  Check,
  X,
  FolderOpen,
  Sparkles,
  ShieldAlert,
  MessageSquareDot,
  CheckCircle2,
  Search
} from 'lucide-react'
import { TermWrap } from '../termwrap/TermWrap'
import { registerTermWrap, unregisterTermWrap } from '../termwrap/registry'

interface TerminalPaneProps {
  session: TerminalSessionMetadata
  isActive: boolean
  isVisible: boolean
  onSelect: () => void
  onClose: () => void
  onRestart: (useResume: boolean) => void
  onLaunchAgent: (agentType: AgentType) => void
  onCwdChange?: (newCwd: string) => void
  onOscStatus?: (status: AgentStatus, snippet: string) => void
}

const STATUS_META: Record<
  AgentStatus,
  { label: string; badgeClass: string; icon?: React.ReactNode }
> = {
  starting: {
    label: 'Starting...',
    badgeClass: 'status-starting'
  },
  running: {
    label: 'Running',
    badgeClass: 'status-running'
  },
  waiting_permission: {
    label: 'Needs Permission',
    badgeClass: 'status-permission',
    icon: <ShieldAlert size={13} />
  },
  waiting_input: {
    label: 'Waiting Input',
    badgeClass: 'status-input',
    icon: <MessageSquareDot size={13} />
  },
  completed: {
    label: 'Task Finished',
    badgeClass: 'status-completed',
    icon: <CheckCircle2 size={13} />
  },
  exited: {
    label: 'Exited',
    badgeClass: 'status-exited'
  }
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({
  session,
  isActive,
  isVisible,
  onSelect,
  onClose,
  onRestart,
  onLaunchAgent,
  onCwdChange,
  onOscStatus
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termWrapRef = useRef<TermWrap | null>(null)
  const ptyCreatedRef = useRef<boolean>(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const profile = AGENT_PROFILES[session.agentType]
  const currentStatus: AgentStatus = session.lastStatus || 'starting'
  const statusInfo = STATUS_META[currentStatus]

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const wrap = new TermWrap(session.id, container, {
      onData: (data) => {
        window.codingArea.writePty(session.id, data)
      },
      onResize: (cols, rows) => {
        window.codingArea.resizePty(session.id, cols, rows)
      },
      onOscCwdChange: (newCwd) => {
        onCwdChange?.(newCwd)
      },
      onOscNotification: (status, message) => {
        onOscStatus?.(status, message)
      }
    })

    termWrapRef.current = wrap
    registerTermWrap(session.id, wrap)

    // Restore serialized ANSI state from `@xterm/addon-serialize` if present
    if (session.scrollback && session.scrollback.length > 0) {
      wrap.restoreSerializedState(session.scrollback)
    }

    const unsubscribePtyData = window.codingArea.onPtyData((payload) => {
      if (payload.sessionId === session.id) {
        wrap.write(payload.data)
      }
    })

    requestAnimationFrame(() => {
      wrap.fitAndSync()
      if (!ptyCreatedRef.current) {
        ptyCreatedRef.current = true
        window.codingArea.createPty({
          id: session.id,
          title: session.title,
          agentType: session.agentType,
          cwd: session.cwd,
          cols: wrap.terminal.cols || 100,
          rows: wrap.terminal.rows || 30,
          customArgs: session.customArgs,
          autoStartAgent: session.autoStartAgent,
          useResumeFlag: session.useResumeFlag
        })
      }
    })

    return () => {
      unsubscribePtyData()
      unregisterTermWrap(session.id)
      wrap.dispose()
      termWrapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  // Re-fit when visibility or active pane changes
  useEffect(() => {
    if (!isVisible || !termWrapRef.current) return
    const timer = setTimeout(() => {
      termWrapRef.current?.fitAndSync()
      if (isActive) {
        termWrapRef.current?.focus()
      }
    }, 60)
    return () => clearTimeout(timer)
  }, [isVisible, isActive, session.id])

  const sendQuickResponse = (text: string): void => {
    window.codingArea.writePty(session.id, text)
    termWrapRef.current?.focus()
  }

  return (
    <div
      className={`terminal-pane ${isActive ? 'pane-active' : ''} ${
        isVisible ? 'pane-visible' : 'pane-hidden'
      } ${
        currentStatus === 'waiting_permission'
          ? 'pane-attention-permission'
          : currentStatus === 'waiting_input'
            ? 'pane-attention-input'
            : ''
      }`}
      onMouseDown={onSelect}
    >
      {/* Pane Top Header */}
      <div className="pane-header">
        <div className="pane-header-left">
          <span
            className="agent-pill"
            style={{
              backgroundColor: `${profile.accentColor}22`,
              color: profile.accentColor,
              borderColor: `${profile.accentColor}55`
            }}
          >
            {profile.badgeText}
          </span>
          <span className="pane-title" title={session.title}>
            {session.title}
          </span>
          <span className="pane-cwd" title={session.cwd}>
            <FolderOpen size={12} />
            {session.cwd}
          </span>
        </div>

        <div className="pane-header-right">
          {/* Status Badge */}
          <span className={`status-badge ${statusInfo.badgeClass}`}>
            {statusInfo.icon}
            <span>{statusInfo.label}</span>
          </span>

          {/* Quick Permission Approval Buttons when Agent is asking permission */}
          {currentStatus === 'waiting_permission' && (
            <div
              className="permission-quick-actions"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="btn-quick-approve"
                title="Send 'y' + Enter to approve permission"
                onClick={() => sendQuickResponse('y\r')}
              >
                <Check size={12} /> Approve (y)
              </button>
              <button
                className="btn-quick-deny"
                title="Send 'n' + Enter to deny"
                onClick={() => sendQuickResponse('n\r')}
              >
                <X size={12} /> Deny (n)
              </button>
            </div>
          )}

          {/* Toolbar Actions */}
          <div
            className="pane-toolbar-actions"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="pane-icon-btn"
              title="Search in terminal (@xterm/addon-search)"
              onClick={() => setShowSearch((prev) => !prev)}
            >
              <Search size={13} />
            </button>
            <button
              className="pane-icon-btn"
              title={`Run ${profile.command || 'agent'} command in terminal`}
              onClick={() =>
                onLaunchAgent(
                  session.agentType === 'shell' ? 'claude' : session.agentType
                )
              }
            >
              <Play size={13} />
            </button>
            <button
              className="pane-icon-btn"
              title="Restart terminal & agent"
              onClick={() => onRestart(false)}
            >
              <RotateCcw size={13} />
            </button>
            {session.agentType === 'claude' && (
              <button
                className="pane-icon-btn"
                title="Restart Claude with --continue"
                onClick={() => onRestart(true)}
              >
                <Sparkles size={13} />
              </button>
            )}
            <button
              className="pane-icon-btn pane-close-btn"
              title="Close terminal session"
              onClick={onClose}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Inline Search Bar powered by @xterm/addon-search */}
      {showSearch && (
        <div
          className="pane-search-bar"
          onClick={(e) => e.stopPropagation()}
        >
          <Search size={13} />
          <input
            type="text"
            placeholder="Find in terminal output..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              termWrapRef.current?.findNext(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                termWrapRef.current?.findNext(searchQuery)
              } else if (e.key === 'Escape') {
                setShowSearch(false)
              }
            }}
            autoFocus
          />
          <button onClick={() => setShowSearch(false)}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* Live Attention Banner when permission is needed */}
      {currentStatus === 'waiting_permission' && session.lastPromptSnippet && (
        <div className="pane-permission-banner">
          <div className="banner-text">
            <ShieldAlert size={14} />
            <span>
              <strong>Permission requested:</strong> {session.lastPromptSnippet}
            </span>
          </div>
          <div className="banner-buttons">
            <button onClick={() => sendQuickResponse('y\r')}>Yes (y)</button>
            <button onClick={() => sendQuickResponse('1\r')}>Option 1</button>
            <button onClick={() => sendQuickResponse('\r')}>Enter ↵</button>
            <button className="danger" onClick={() => sendQuickResponse('n\r')}>
              No (n)
            </button>
          </div>
        </div>
      )}

      {/* Xterm Mount Container */}
      <div className="xterm-viewport-wrapper" ref={containerRef} />
    </div>
  )
}
