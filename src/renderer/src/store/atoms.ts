import { atom } from 'jotai'
import {
  LayoutMode,
  NotificationRecord,
  TerminalSessionMetadata
} from '@shared/types'

export const sessionsAtom = atom<TerminalSessionMetadata[]>([])
export const activeSessionIdAtom = atom<string | null>(null)
export const layoutModeAtom = atom<LayoutMode>('split-2')
export const visiblePaneIdsAtom = atom<string[]>([])
export const notificationsAtom = atom<NotificationRecord[]>([])
export const soundEnabledAtom = atom<boolean>(true)
export const desktopNotifyEnabledAtom = atom<boolean>(true)
export const isWorkspaceLoadedAtom = atom<boolean>(false)
export const isNewModalOpenAtom = atom<boolean>(false)

export const unacknowledgedCountAtom = atom((get) => {
  const list = get(notificationsAtom)
  return list.filter((n) => !n.acknowledged).length
})

export const attentionSessionsAtom = atom((get) => {
  const sessions = get(sessionsAtom)
  return sessions.filter(
    (s) =>
      s.lastStatus === 'waiting_permission' || s.lastStatus === 'waiting_input'
  )
})
