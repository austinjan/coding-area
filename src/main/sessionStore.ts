import Store from 'electron-store'
import { PersistedWorkspaceState } from '../shared/types'

type RawStore = {
  get: (key: 'workspace') => PersistedWorkspaceState | null
  set: (key: 'workspace', val: PersistedWorkspaceState) => void
}

export class SessionStore {
  private store: RawStore

  constructor() {
    // Handle ESM default export interop when bundled into CommonJS by electron-vite
    const StoreCtor =
      (Store as unknown as { default?: new (opts: unknown) => RawStore })
        .default || (Store as unknown as new (opts: unknown) => RawStore)

    this.store = new StoreCtor({
      name: 'coding-area-workspace',
      defaults: {
        workspace: null
      }
    })
  }

  public load(): PersistedWorkspaceState | null {
    try {
      const data = this.store.get('workspace')
      if (!data || !Array.isArray(data.sessions)) {
        return null
      }
      return data
    } catch (error) {
      console.error('[SessionStore] Failed to load workspace state:', error)
      return null
    }
  }

  public save(state: PersistedWorkspaceState): boolean {
    try {
      const sanitized: PersistedWorkspaceState = {
        ...state,
        sessions: state.sessions.map((s) => ({
          ...s,
          scrollback: s.scrollback ? s.scrollback.slice(-150_000) : undefined
        }))
      }
      this.store.set('workspace', sanitized)
      return true
    } catch (error) {
      console.error('[SessionStore] Failed to save workspace state:', error)
      return false
    }
  }
}
