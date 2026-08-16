/**
 * Real-UI assembly closure. The whole layout tree hangs from the built-in
 * `root` slot, which is the only ctx-level slot render in the application.
 */
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { bindSnapshotSelector } from './bind.ts'
import { DocumentTitle } from './DocumentTitle.tsx'
import { PendingInteractionNotifier } from './PendingInteractionNotifier.tsx'
import type { PendingInteractionAlert } from './PendingInteractionNotifier.tsx'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId, SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'

/** Inputs available after the UI renderer's inject set activates. */
export interface AssemblyDeps {
  /** Client context carrying the slots and sessions services. */
  ctx: Context
}

/**
 * Build the assembled application factory.
 * @param deps - Active UI-renderer dependencies.
 * @returns Factory producing the application React tree.
 */
export function buildRenderApp(deps: AssemblyDeps): () => ReactNode {
  const { ctx } = deps
  const sessions = ctx.get('sessions')
  if (sessions === undefined) throw new Error('ui renderer: sessions service unavailable')
  const useSessions = bindSnapshotSelector(sessions.list)
  const SessionDocumentTitle = (): ReactNode => {
    const title = useSessions((state) => {
      const id = state.current
      return id === undefined ? undefined : state.byId[id]?.title
    })
    return <DocumentTitle {...title === undefined ? {} : { title }} />
  }
  const openSession = (id: SessionId): void => { sessions.open(id) }
  const PendingInteractionAlerts = (): ReactNode => {
    const byId = useSessions(state => state.byId)
    const alerts = useMemo<PendingInteractionAlert[]>(() => {
      const result: PendingInteractionAlert[] = []
      for (const [id, summary] of Object.entries(byId) as [SessionId, SessionSummary][]) {
        if (summary.pendingInteraction === undefined) continue
        result.push({ sessionId: id, status: summary.pendingInteraction, displayTitle: summary.displayTitle })
      }
      return result
    }, [byId])
    return <PendingInteractionNotifier alerts={alerts} onOpen={openSession} />
  }
  return () => (
    <>
      <SessionDocumentTitle />
      <PendingInteractionAlerts />
      {ctx.slots.renderSlot('root', {})}
    </>
  )
}
