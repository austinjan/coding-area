import { TermWrap } from './TermWrap'

const activeTermWraps = new Map<string, TermWrap>()

export function registerTermWrap(sessionId: string, instance: TermWrap): void {
  activeTermWraps.set(sessionId, instance)
}

export function unregisterTermWrap(sessionId: string): void {
  activeTermWraps.delete(sessionId)
}

export function getTermWrap(sessionId: string): TermWrap | undefined {
  return activeTermWraps.get(sessionId)
}

export function serializeAllTermWraps(): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [id, wrap] of activeTermWraps.entries()) {
    const serialized = wrap.serializeState()
    if (serialized) {
      result[id] = serialized
    }
  }
  return result
}
