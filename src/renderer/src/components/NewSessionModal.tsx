import React, { useState, useEffect } from 'react'
import { AGENT_PROFILES, AgentType } from '@shared/types'
import { FolderOpen, Plus, TerminalSquare, X } from 'lucide-react'

interface NewSessionModalProps {
  isOpen: boolean
  defaultCwd: string
  onClose: () => void
  onCreate: (params: {
    title: string
    agentType: AgentType
    cwd: string
    customArgs: string
    autoStartAgent: boolean
  }) => void
}

const AGENT_ORDER: AgentType[] = ['codex', 'claude', 'agy', 'shell']

export const NewSessionModal: React.FC<NewSessionModalProps> = ({
  isOpen,
  defaultCwd,
  onClose,
  onCreate
}) => {
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('claude')
  const [title, setTitle] = useState('')
  const [cwd, setCwd] = useState(defaultCwd)
  const [customArgs, setCustomArgs] = useState('')
  const [autoStartAgent, setAutoStartAgent] = useState(true)

  useEffect(() => {
    if (isOpen) {
      setCwd(defaultCwd)
      setTitle('')
      setCustomArgs('')
      setAutoStartAgent(true)
    }
  }, [isOpen, defaultCwd])

  if (!isOpen) return null

  const profile = AGENT_PROFILES[selectedAgent]

  const handleBrowse = async (): Promise<void> => {
    const dir = await window.codingArea.selectDirectory()
    if (dir) {
      setCwd(dir)
    }
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    const finalTitle =
      title.trim() ||
      `${profile.name} (${cwd.split(/[\\/]/).filter(Boolean).pop() || 'workspace'})`
    onCreate({
      title: finalTitle,
      agentType: selectedAgent,
      cwd: cwd.trim() || defaultCwd,
      customArgs: customArgs.trim(),
      autoStartAgent: selectedAgent === 'shell' ? false : autoStartAgent
    })
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <TerminalSquare size={18} className="accent-icon" />
            <h3>Launch Coding Agent Terminal</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <label className="field-label">Select Coding Agent</label>
          <div className="agent-grid-selector">
            {AGENT_ORDER.map((type) => {
              const item = AGENT_PROFILES[type]
              const selected = selectedAgent === type
              return (
                <button
                  type="button"
                  key={type}
                  className={`agent-option-card ${selected ? 'selected' : ''}`}
                  style={
                    selected
                      ? {
                          borderColor: item.accentColor,
                          backgroundColor: `${item.accentColor}15`
                        }
                      : undefined
                  }
                  onClick={() => setSelectedAgent(type)}
                >
                  <div className="agent-option-top">
                    <span
                      className="agent-badge"
                      style={{
                        backgroundColor: `${item.accentColor}28`,
                        color: item.accentColor
                      }}
                    >
                      {item.badgeText}
                    </span>
                    {item.command && (
                      <code className="agent-cmd-tag">{item.command}</code>
                    )}
                  </div>
                  <div className="agent-option-name">{item.name}</div>
                  <div className="agent-option-desc">{item.description}</div>
                </button>
              )
            })}
          </div>

          <div className="form-row">
            <label className="field-label">Session Title (optional)</label>
            <input
              type="text"
              className="text-input"
              placeholder={`${profile.name} — Feature / Task name`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="form-row">
            <label className="field-label">Working Directory</label>
            <div className="input-with-button">
              <input
                type="text"
                className="text-input"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
              />
              <button
                type="button"
                className="secondary-btn"
                onClick={handleBrowse}
              >
                <FolderOpen size={14} /> Browse
              </button>
            </div>
          </div>

          {selectedAgent !== 'shell' && (
            <>
              <div className="form-row">
                <label className="field-label">
                  CLI Flags / Arguments (optional)
                </label>
                <input
                  type="text"
                  className="text-input"
                  placeholder={
                    selectedAgent === 'claude'
                      ? 'e.g. --continue or --dangerously-skip-permissions'
                      : selectedAgent === 'codex'
                        ? 'e.g. --full-auto or --model o3'
                        : 'e.g. custom flags passed to agy'
                  }
                  value={customArgs}
                  onChange={(e) => setCustomArgs(e.target.value)}
                />
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={autoStartAgent}
                  onChange={(e) => setAutoStartAgent(e.target.checked)}
                />
                <span>
                  Automatically execute <code>{profile.command}</code> when
                  terminal opens
                </span>
              </label>
            </>
          )}

          <div className="modal-footer">
            <button type="button" className="ghost-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-btn">
              <Plus size={15} /> Create Agent Console
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
