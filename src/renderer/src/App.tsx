import React, { useEffect, useState, useCallback } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import {
  AGENT_PROFILES,
  AgentStatus,
  AgentType,
  LayoutMode,
  NotificationRecord,
  PersistedWorkspaceState,
  TerminalSessionMetadata
} from '@shared/types'
import {
  activeSessionIdAtom,
  attentionSessionsAtom,
  desktopNotifyEnabledAtom,
  isNewModalOpenAtom,
  isWorkspaceLoadedAtom,
  layoutModeAtom,
  notificationsAtom,
  sessionsAtom,
  soundEnabledAtom,
  unacknowledgedCountAtom,
  visiblePaneIdsAtom
} from './store/atoms'
import { TerminalPane } from './components/TerminalPane'
import { NewSessionModal } from './components/NewSessionModal'
import { serializeAllTermWraps } from './termwrap/registry'
import { playStatusAlertSound } from './utils/sound'
import {
  Bell,
  BellOff,
  CheckCircle2,
  Columns2,
  Columns3,
  Grid2X2,
  LayoutList,
  MessageSquareDot,
  Plus,
  ShieldAlert,
  Terminal,
  Trash2,
  Volume2,
  VolumeX
} from 'lucide-react'

function generateId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function App(): React.JSX.Element {
  const [sessions, setSessions] = useAtom(sessionsAtom)
  const [activeSessionId, setActiveSessionId] = useAtom(activeSessionIdAtom)
  const [layoutMode, setLayoutMode] = useAtom(layoutModeAtom)
  const [visiblePaneIds, setVisiblePaneIds] = useAtom(visiblePaneIdsAtom)
  const [notifications, setNotifications] = useAtom(notificationsAtom)
  const [soundEnabled, setSoundEnabled] = useAtom(soundEnabledAtom)
  const [desktopNotifyEnabled, setDesktopNotifyEnabled] = useAtom(
    desktopNotifyEnabledAtom
  )
  const [isWorkspaceLoaded, setIsWorkspaceLoaded] = useAtom(
    isWorkspaceLoadedAtom
  )
  const [isNewModalOpen, setIsNewModalOpen] = useAtom(isNewModalOpenAtom)
  const unackCount = useAtomValue(unacknowledgedCountAtom)
  const attentionSessions = useAtomValue(attentionSessionsAtom)

  const [defaultCwd, setDefaultCwd] = useState<string>('')
  const [showNotificationDrawer, setShowNotificationDrawer] =
    useState<boolean>(false)

  // Load persisted workspace on startup
  useEffect(() => {
    let mounted = true
    async function initWorkspace(): Promise<void> {
      const cwd = await window.codingArea.getDefaultCwd()
      if (!mounted) return
      setDefaultCwd(cwd)

      const saved = await window.codingArea.loadWorkspace()
      if (!mounted) return

      if (saved && saved.sessions && saved.sessions.length > 0) {
        const restoredSessions: TerminalSessionMetadata[] = saved.sessions.map(
          (s) => ({
            ...s,
            lastStatus: 'starting'
          })
        )
        setSessions(restoredSessions)
        setLayoutMode(saved.layoutMode || 'split-2')
        setSoundEnabled(saved.soundEnabled ?? true)
        setDesktopNotifyEnabled(saved.desktopNotifyEnabled ?? true)
        const firstId = restoredSessions[0].id
        setActiveSessionId(
          saved.activeSessionId &&
            restoredSessions.some((s) => s.id === saved.activeSessionId)
            ? saved.activeSessionId
            : firstId
        )
        setVisiblePaneIds(
          saved.visiblePaneIds && saved.visiblePaneIds.length > 0
            ? saved.visiblePaneIds.filter((id) =>
                restoredSessions.some((s) => s.id === id)
              )
            : restoredSessions.slice(0, 2).map((s) => s.id)
        )
      } else {
        // First time launch: create starter terminals for Codex, Claude, and AGY
        const starterCwd = cwd || 'C:\\'
        const initialSessions: TerminalSessionMetadata[] = [
          {
            id: generateId(),
            title: 'Claude Code — Main',
            agentType: 'claude',
            cwd: starterCwd,
            autoStartAgent: true,
            createdAt: Date.now(),
            lastStatus: 'starting'
          },
          {
            id: generateId(),
            title: 'Codex CLI — Worker',
            agentType: 'codex',
            cwd: starterCwd,
            autoStartAgent: true,
            createdAt: Date.now() + 1,
            lastStatus: 'starting'
          },
          {
            id: generateId(),
            title: 'AGY CLI — Agent',
            agentType: 'agy',
            cwd: starterCwd,
            autoStartAgent: true,
            createdAt: Date.now() + 2,
            lastStatus: 'starting'
          }
        ]
        setSessions(initialSessions)
        setActiveSessionId(initialSessions[0].id)
        setLayoutMode('split-2')
        setVisiblePaneIds([initialSessions[0].id, initialSessions[1].id])
      }
      setIsWorkspaceLoaded(true)
    }

    initWorkspace()
    return () => {
      mounted = false
    }
  }, [
    setActiveSessionId,
    setDesktopNotifyEnabled,
    setIsWorkspaceLoaded,
    setLayoutMode,
    setSessions,
    setSoundEnabled,
    setVisiblePaneIds
  ])

  // Persist workspace state (including `@xterm/addon-serialize` ANSI state) periodically and on beforeunload
  const persistCurrentState = useCallback(() => {
    if (!isWorkspaceLoaded) return
    const serializedMap = serializeAllTermWraps()
    const stateToSave: PersistedWorkspaceState = {
      version: 1,
      layoutMode,
      activeSessionId,
      visiblePaneIds,
      soundEnabled,
      desktopNotifyEnabled,
      sessions: sessions.map((s) => ({
        ...s,
        scrollback: serializedMap[s.id] || s.scrollback || ''
      }))
    }
    window.codingArea.saveWorkspace(stateToSave)
  }, [
    isWorkspaceLoaded,
    layoutMode,
    activeSessionId,
    visiblePaneIds,
    soundEnabled,
    desktopNotifyEnabled,
    sessions
  ])

  useEffect(() => {
    if (!isWorkspaceLoaded) return
    const timer = setTimeout(() => {
      persistCurrentState()
    }, 800)
    return () => clearTimeout(timer)
  }, [
    sessions,
    layoutMode,
    activeSessionId,
    visiblePaneIds,
    soundEnabled,
    desktopNotifyEnabled,
    isWorkspaceLoaded,
    persistCurrentState
  ])

  useEffect(() => {
    const handleBeforeUnload = (): void => {
      persistCurrentState()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [persistCurrentState])

  // Record notification helper
  const pushStatusNotification = useCallback(
    (
      sessionId: string,
      status: AgentStatus,
      reason?: string,
      snippet?: string
    ) => {
      setSessions((prev) => {
        const target = prev.find((s) => s.id === sessionId)
        if (!target) return prev

        if (
          status === 'waiting_permission' ||
          status === 'waiting_input' ||
          status === 'completed'
        ) {
          if (soundEnabled) {
            playStatusAlertSound(status)
          }

          const record: NotificationRecord = {
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            sessionId,
            sessionTitle: target.title,
            agentType: target.agentType,
            status,
            message:
              reason ||
              (status === 'waiting_permission'
                ? 'Permission approval requested'
                : status === 'waiting_input'
                  ? 'Agent waiting for your input'
                  : 'Agent task completed'),
            snippet: snippet || '',
            timestamp: Date.now(),
            acknowledged: false
          }
          setNotifications((old) => [record, ...old].slice(0, 40))
        }

        return prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                lastStatus: status,
                lastPromptSnippet: snippet || s.lastPromptSnippet
              }
            : s
        )
      })
    },
    [setNotifications, setSessions, soundEnabled]
  )

  // Subscribe to PTY status, exit, and focus events from Main Process
  useEffect(() => {
    const unsubStatus = window.codingArea.onPtyStatus((payload) => {
      pushStatusNotification(
        payload.sessionId,
        payload.status,
        payload.reason,
        payload.snippet
      )
    })

    const unsubExit = window.codingArea.onPtyExit((payload) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === payload.sessionId ? { ...s, lastStatus: 'exited' } : s
        )
      )
    })

    const unsubFocus = window.codingArea.onFocusSession((sessionId) => {
      handleSelectSession(sessionId)
    })

    return () => {
      unsubStatus()
      unsubExit()
      unsubFocus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushStatusNotification, setSessions])

  const maxPanesForMode = (mode: LayoutMode): number => {
    switch (mode) {
      case 'tabs':
        return 1
      case 'split-2':
        return 2
      case 'split-3':
        return 3
      case 'grid-4':
        return 4
    }
  }

  const handleSelectSession = (sessionId: string): void => {
    setActiveSessionId(sessionId)
    // Acknowledge notifications for this session
    setNotifications((prev) =>
      prev.map((n) =>
        n.sessionId === sessionId ? { ...n, acknowledged: true } : n
      )
    )

    setVisiblePaneIds((prev) => {
      if (prev.includes(sessionId)) return prev
      const limit = maxPanesForMode(layoutMode)
      if (limit === 1) return [sessionId]
      if (prev.length < limit) return [...prev, sessionId]
      return [...prev.slice(0, limit - 1), sessionId]
    })
  }

  const handleChangeLayoutMode = (nextMode: LayoutMode): void => {
    setLayoutMode(nextMode)
    const limit = maxPanesForMode(nextMode)
    setVisiblePaneIds((prev) => {
      const active = activeSessionId || sessions[0]?.id
      const base = active
        ? [active, ...prev.filter((id) => id !== active)]
        : prev
      const filled = [...base]
      for (const s of sessions) {
        if (filled.length >= limit) break
        if (!filled.includes(s.id)) {
          filled.push(s.id)
        }
      }
      return filled.slice(0, limit)
    })
  }

  const handleCreateSession = (params: {
    title: string
    agentType: AgentType
    cwd: string
    customArgs: string
    autoStartAgent: boolean
  }): void => {
    const newSession: TerminalSessionMetadata = {
      id: generateId(),
      title: params.title,
      agentType: params.agentType,
      cwd: params.cwd,
      customArgs: params.customArgs,
      autoStartAgent: params.autoStartAgent,
      createdAt: Date.now(),
      lastStatus: 'starting'
    }
    setSessions((prev) => [...prev, newSession])
    setActiveSessionId(newSession.id)
    setVisiblePaneIds((prev) => {
      const limit = maxPanesForMode(layoutMode)
      if (limit === 1) return [newSession.id]
      if (prev.length < limit) return [...prev, newSession.id]
      return [...prev.slice(0, limit - 1), newSession.id]
    })
  }

  const handleQuickSpawnAgent = (agentType: AgentType): void => {
    const profile = AGENT_PROFILES[agentType]
    const count = sessions.filter((s) => s.agentType === agentType).length + 1
    handleCreateSession({
      title: `${profile.name} #${count}`,
      agentType,
      cwd: defaultCwd || 'C:\\',
      customArgs: '',
      autoStartAgent: agentType !== 'shell'
    })
  }

  const handleCloseSession = async (sessionId: string): Promise<void> => {
    await window.codingArea.killPty(sessionId)
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== sessionId)
      if (activeSessionId === sessionId) {
        setActiveSessionId(remaining[0]?.id || null)
      }
      setVisiblePaneIds((vis) => {
        const nextVis = vis.filter((id) => id !== sessionId)
        if (nextVis.length === 0 && remaining[0]) {
          return [remaining[0].id]
        }
        return nextVis
      })
      return remaining
    })
  }

  const handleRestartSession = async (
    sessionId: string,
    useResumeFlag: boolean
  ): Promise<void> => {
    const target = sessions.find((s) => s.id === sessionId)
    if (!target) return
    await window.codingArea.killPty(sessionId)
    await window.codingArea.createPty({
      id: target.id,
      title: target.title,
      agentType: target.agentType,
      cwd: target.cwd,
      cols: 100,
      rows: 30,
      customArgs: target.customArgs,
      autoStartAgent: true,
      useResumeFlag
    })
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, lastStatus: 'starting' } : s
      )
    )
  }

  const handleLaunchAgentInSession = async (
    sessionId: string,
    agentType: AgentType
  ): Promise<void> => {
    await window.codingArea.launchAgent(sessionId, agentType)
  }

  // Compute ordered visible sessions for Allotment split panes
  const limit = maxPanesForMode(layoutMode)
  const effectiveVisibleIds =
    visiblePaneIds.length > 0
      ? visiblePaneIds.slice(0, limit)
      : activeSessionId
        ? [activeSessionId]
        : sessions.slice(0, limit).map((s) => s.id)

  const visibleSessions = effectiveVisibleIds
    .map((id) => sessions.find((s) => s.id === id))
    .filter((s): s is TerminalSessionMetadata => Boolean(s))

  const hiddenSessions = sessions.filter(
    (s) => !effectiveVisibleIds.includes(s.id)
  )

  return (
    <div className="app-shell">
      {/* Top Workspace Header */}
      <header className="top-bar">
        <div className="brand-group">
          <div className="brand-logo">
            <Terminal size={17} />
          </div>
          <div>
            <div className="brand-title">Coding Area</div>
            <div className="brand-subtitle">
              Multi-Agent Terminal Platform · Codex · Claude · AGY
            </div>
          </div>
        </div>

        {/* Quick 1-Click Agent Spawners */}
        <div className="quick-spawn-bar">
          <span className="quick-spawn-label">Quick Launch:</span>
          {(['codex', 'claude', 'agy', 'shell'] as AgentType[]).map((type) => {
            const prof = AGENT_PROFILES[type]
            return (
              <button
                key={type}
                className="quick-spawn-btn"
                onClick={() => handleQuickSpawnAgent(type)}
                title={`Start a new ${prof.name} terminal in ${defaultCwd}`}
              >
                <span
                  className="dot"
                  style={{ backgroundColor: prof.accentColor }}
                />
                <span>+ {prof.name}</span>
              </button>
            )
          })}
          <button
            className="custom-spawn-btn"
            onClick={() => setIsNewModalOpen(true)}
          >
            <Plus size={14} /> Custom...
          </button>
        </div>

        {/* Layout Switcher & Notification Controls */}
        <div className="top-bar-right">
          <div className="layout-switcher" title="Switch Multi-Pane Layout">
            <button
              className={layoutMode === 'tabs' ? 'active' : ''}
              onClick={() => handleChangeLayoutMode('tabs')}
              title="Single Tab View"
            >
              <LayoutList size={15} />
            </button>
            <button
              className={layoutMode === 'split-2' ? 'active' : ''}
              onClick={() => handleChangeLayoutMode('split-2')}
              title="2-Pane Resizable Split (Allotment)"
            >
              <Columns2 size={15} />
            </button>
            <button
              className={layoutMode === 'split-3' ? 'active' : ''}
              onClick={() => handleChangeLayoutMode('split-3')}
              title="3-Pane Resizable Split (Allotment)"
            >
              <Columns3 size={15} />
            </button>
            <button
              className={layoutMode === 'grid-4' ? 'active' : ''}
              onClick={() => handleChangeLayoutMode('grid-4')}
              title="2x2 4-Agent Grid (Allotment)"
            >
              <Grid2X2 size={15} />
            </button>
          </div>

          <button
            className={`icon-toggle-btn ${soundEnabled ? 'active' : ''}`}
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={
              soundEnabled
                ? 'Sound Alerts Enabled'
                : 'Sound Alerts Muted'
            }
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>

          <button
            className={`icon-toggle-btn ${desktopNotifyEnabled ? 'active' : ''}`}
            onClick={() => setDesktopNotifyEnabled(!desktopNotifyEnabled)}
            title={
              desktopNotifyEnabled
                ? 'OS Desktop Notifications Enabled'
                : 'OS Desktop Notifications Disabled'
            }
          >
            {desktopNotifyEnabled ? <Bell size={15} /> : <BellOff size={15} />}
          </button>

          <button
            className={`notif-drawer-btn ${unackCount > 0 ? 'has-unread' : ''}`}
            onClick={() => setShowNotificationDrawer((prev) => !prev)}
          >
            <Bell size={15} />
            <span>Alerts</span>
            {unackCount > 0 && (
              <span className="unread-pill">{unackCount}</span>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area: Sidebar + Resizable Allotment Split Panes */}
      <div className="workspace-body">
        {/* Left Agent Sessions Sidebar */}
        <aside className="agent-sidebar">
          <div className="sidebar-section-header">
            <span>ACTIVE TERMINALS ({sessions.length})</span>
            <button
              className="sidebar-add-btn"
              onClick={() => setIsNewModalOpen(true)}
              title="New Coding Agent Session"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="session-list">
            {sessions.map((s) => {
              const prof = AGENT_PROFILES[s.agentType]
              const isSelected = s.id === activeSessionId
              const isShownInSplit = effectiveVisibleIds.includes(s.id)
              const status = s.lastStatus || 'starting'

              return (
                <div
                  key={s.id}
                  className={`session-card ${isSelected ? 'selected' : ''} ${
                    status === 'waiting_permission'
                      ? 'card-permission'
                      : status === 'waiting_input'
                        ? 'card-input'
                        : ''
                  }`}
                  onClick={() => handleSelectSession(s.id)}
                >
                  <div className="session-card-top">
                    <span
                      className="agent-mini-badge"
                      style={{
                        backgroundColor: `${prof.accentColor}24`,
                        color: prof.accentColor
                      }}
                    >
                      {prof.badgeText}
                    </span>
                    <span className="session-card-title">{s.title}</span>
                    {isShownInSplit && layoutMode !== 'tabs' && (
                      <span className="split-indicator" title="Visible in Split">
                        VIEW
                      </span>
                    )}
                  </div>

                  <div className="session-card-meta">
                    <span className={`status-dot dot-${status}`} />
                    <span className="status-text">
                      {status === 'waiting_permission'
                        ? 'Asking Permission'
                        : status === 'waiting_input'
                          ? 'Waiting Input'
                          : status === 'completed'
                            ? 'Task Finished'
                            : status === 'running'
                              ? 'Running'
                              : status === 'exited'
                                ? 'Exited'
                                : 'Starting'}
                    </span>
                  </div>

                  {s.lastPromptSnippet &&
                    (status === 'waiting_permission' ||
                      status === 'waiting_input' ||
                      status === 'completed') && (
                      <div className="session-snippet">
                        {s.lastPromptSnippet}
                      </div>
                    )}
                </div>
              )
            })}
          </div>

          {/* Attention Queue Summary in Sidebar Footer */}
          {attentionSessions.length > 0 && (
            <div className="attention-box">
              <div className="attention-box-title">
                <ShieldAlert size={14} />
                <span>Attention Required ({attentionSessions.length})</span>
              </div>
              {attentionSessions.map((att) => (
                <button
                  key={att.id}
                  className="attention-jump-btn"
                  onClick={() => handleSelectSession(att.id)}
                >
                  <span>{att.title}</span>
                  <span className="jump-tag">
                    {att.lastStatus === 'waiting_permission'
                      ? 'Approve/Deny'
                      : 'Input'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Center Terminal Stage with Allotment Resizable Split Panes */}
        <main className="terminal-stage">
          {sessions.length === 0 ? (
            <div className="empty-stage">
              <Terminal size={42} />
              <h2>No Active Coding Agent Sessions</h2>
              <p>
                Launch Codex CLI, Claude Code, or AGY in parallel split panes.
              </p>
              <button
                className="primary-btn"
                onClick={() => setIsNewModalOpen(true)}
              >
                <Plus size={16} /> Launch Coding Agent
              </button>
            </div>
          ) : layoutMode === 'grid-4' && visibleSessions.length >= 3 ? (
            <Allotment vertical>
              <Allotment.Pane>
                <Allotment>
                  {visibleSessions.slice(0, 2).map((sess) => (
                    <Allotment.Pane key={sess.id}>
                      <TerminalPane
                        session={sess}
                        isActive={sess.id === activeSessionId}
                        isVisible={true}
                        onSelect={() => handleSelectSession(sess.id)}
                        onClose={() => handleCloseSession(sess.id)}
                        onRestart={(resume) =>
                          handleRestartSession(sess.id, resume)
                        }
                        onLaunchAgent={(type) =>
                          handleLaunchAgentInSession(sess.id, type)
                        }
                        onCwdChange={(newCwd) =>
                          setSessions((prev) =>
                            prev.map((item) =>
                              item.id === sess.id
                                ? { ...item, cwd: newCwd }
                                : item
                            )
                          )
                        }
                        onOscStatus={(st, msg) =>
                          pushStatusNotification(sess.id, st, msg, msg)
                        }
                      />
                    </Allotment.Pane>
                  ))}
                </Allotment>
              </Allotment.Pane>
              <Allotment.Pane>
                <Allotment>
                  {visibleSessions.slice(2, 4).map((sess) => (
                    <Allotment.Pane key={sess.id}>
                      <TerminalPane
                        session={sess}
                        isActive={sess.id === activeSessionId}
                        isVisible={true}
                        onSelect={() => handleSelectSession(sess.id)}
                        onClose={() => handleCloseSession(sess.id)}
                        onRestart={(resume) =>
                          handleRestartSession(sess.id, resume)
                        }
                        onLaunchAgent={(type) =>
                          handleLaunchAgentInSession(sess.id, type)
                        }
                        onCwdChange={(newCwd) =>
                          setSessions((prev) =>
                            prev.map((item) =>
                              item.id === sess.id
                                ? { ...item, cwd: newCwd }
                                : item
                            )
                          )
                        }
                        onOscStatus={(st, msg) =>
                          pushStatusNotification(sess.id, st, msg, msg)
                        }
                      />
                    </Allotment.Pane>
                  ))}
                </Allotment>
              </Allotment.Pane>
            </Allotment>
          ) : (
            <Allotment>
              {visibleSessions.map((sess) => (
                <Allotment.Pane key={sess.id}>
                  <TerminalPane
                    session={sess}
                    isActive={sess.id === activeSessionId}
                    isVisible={true}
                    onSelect={() => handleSelectSession(sess.id)}
                    onClose={() => handleCloseSession(sess.id)}
                    onRestart={(resume) =>
                      handleRestartSession(sess.id, resume)
                    }
                    onLaunchAgent={(type) =>
                      handleLaunchAgentInSession(sess.id, type)
                    }
                    onCwdChange={(newCwd) =>
                      setSessions((prev) =>
                        prev.map((item) =>
                          item.id === sess.id ? { ...item, cwd: newCwd } : item
                        )
                      )
                    }
                    onOscStatus={(st, msg) =>
                      pushStatusNotification(sess.id, st, msg, msg)
                    }
                  />
                </Allotment.Pane>
              ))}
            </Allotment>
          )}

          {/* Keep non-visible terminals mounted in the background so their PTY stream & xterm buffer stay live */}
          <div className="background-hidden-terminals" aria-hidden="true">
            {hiddenSessions.map((sess) => (
              <TerminalPane
                key={sess.id}
                session={sess}
                isActive={false}
                isVisible={false}
                onSelect={() => handleSelectSession(sess.id)}
                onClose={() => handleCloseSession(sess.id)}
                onRestart={(resume) => handleRestartSession(sess.id, resume)}
                onLaunchAgent={(type) =>
                  handleLaunchAgentInSession(sess.id, type)
                }
                onCwdChange={(newCwd) =>
                  setSessions((prev) =>
                    prev.map((item) =>
                      item.id === sess.id ? { ...item, cwd: newCwd } : item
                    )
                  )
                }
                onOscStatus={(st, msg) =>
                  pushStatusNotification(sess.id, st, msg, msg)
                }
              />
            ))}
          </div>
        </main>

        {/* Right Slide-Over Notification Feed Drawer */}
        {showNotificationDrawer && (
          <aside className="notification-drawer">
            <div className="drawer-header">
              <span>Agent Activity & Alerts</span>
              <button
                className="clear-btn"
                onClick={() => setNotifications([])}
                title="Clear all notifications"
              >
                <Trash2 size={13} /> Clear
              </button>
            </div>
            <div className="drawer-list">
              {notifications.length === 0 ? (
                <div className="drawer-empty">
                  No agent alerts yet. Notifications will appear here when an
                  agent finishes a task, waits for input, or asks for
                  permission.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`notif-item ${!n.acknowledged ? 'unack' : ''}`}
                    onClick={() => handleSelectSession(n.sessionId)}
                  >
                    <div className="notif-top">
                      <span className="notif-icon">
                        {n.status === 'waiting_permission' ? (
                          <ShieldAlert size={14} className="text-amber" />
                        ) : n.status === 'waiting_input' ? (
                          <MessageSquareDot size={14} className="text-sky" />
                        ) : (
                          <CheckCircle2 size={14} className="text-emerald" />
                        )}
                      </span>
                      <span className="notif-session">{n.sessionTitle}</span>
                      <span className="notif-time">
                        {new Date(n.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </span>
                    </div>
                    <div className="notif-msg">{n.message}</div>
                    {n.snippet && (
                      <div className="notif-snippet">{n.snippet}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>

      {/* New Session Modal */}
      <NewSessionModal
        isOpen={isNewModalOpen}
        defaultCwd={defaultCwd}
        onClose={() => setIsNewModalOpen(false)}
        onCreate={handleCreateSession}
      />
    </div>
  )
}
export default App
