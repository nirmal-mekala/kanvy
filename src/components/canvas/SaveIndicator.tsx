// Network save indicator: a row of dots just above the mode toggle, one per
// network save batch, colored queued / in flight / retrying / resolved
// (state/saveIndicator.ts has the model). No dots, or only green ones, means
// everything has landed. Reads TanStack Query's mutation cache directly, so
// it shows the outbox's real state rather than a parallel bookkeeping copy.

import { useMutationState } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { useEffect, useReducer, useRef } from 'react'
import {
  heldNetworkSaveAtom,
  networkSaveFilters,
} from '../../state/history/boardHistoryAtom'
import {
  deriveSaveDots,
  noteResolved,
  type SaveDotState,
  type SaveMutationSnapshot,
} from '../../state/saveIndicator'

const STATE_LABELS: Record<SaveDotState, string> = {
  queued: 'Queued',
  'in-flight': 'Saving',
  retrying: 'Retrying',
  resolved: 'Saved',
}

// CRAP scoring penalizes this component's 0% coverage — component tests
// aren't a required tier for v0 (spec §13); its logic is the pure
// state/saveIndicator.ts, same precedent as ModeToggle.
// fallow-ignore-next-line complexity
export function SaveIndicator() {
  const mutations = useMutationState({
    filters: networkSaveFilters,
    select: (m): SaveMutationSnapshot => ({
      id: m.mutationId,
      status: m.state.status,
      isPaused: m.state.isPaused,
      failureCount: m.state.failureCount,
    }),
  })
  const held = useAtomValue(heldNetworkSaveAtom)
  const [, rerender] = useReducer((n: number) => n + 1, 0)

  // Saves that had already landed before mount (they stay in the cache for
  // a while) landed an unknown time ago — never flash them green.
  const resolvedAt = useRef<Map<number, number> | null>(null)
  resolvedAt.current ??= noteResolved(mutations, new Map(), -Infinity)
  const now = Date.now()
  noteResolved(mutations, resolvedAt.current, now)
  const { dots, overflow, nextExpiryAt } = deriveSaveDots(
    mutations,
    resolvedAt.current,
    held,
    now,
  )

  useEffect(() => {
    if (nextExpiryAt === undefined) return
    const timer = setTimeout(rerender, nextExpiryAt - Date.now())
    return () => clearTimeout(timer)
  }, [nextExpiryAt])

  const summary = (Object.keys(STATE_LABELS) as SaveDotState[])
    .map((s) => [s, dots.filter((d) => d.state === s).length] as const)
    .filter(([, count]) => count > 0)
    .map(([s, count]) => `${STATE_LABELS[s]}: ${count}`)
    .join(', ')

  return (
    <div className="save-indicator" title={summary || undefined}>
      {dots.map((d) => (
        <span
          key={d.key}
          className="save-indicator__dot"
          data-state={d.state}
        />
      ))}
      {overflow > 0 && (
        <span className="save-indicator__overflow">+{overflow}</span>
      )}
    </div>
  )
}
