// The network save indicator's model (components/canvas/SaveIndicator.tsx):
// one dot per network save batch, colored by where that batch is in the
// ordered outbox (state/history/boardHistoryAtom.ts, ctx/notes/261029-
// edits-to-unconfirmed-creates.md). Pure, so the component only has to
// read TanStack Query's mutation cache and keep a clock.
//
// A batch is one debounced gesture's worth of ops, so a dot is a gesture,
// not an HTTP request. States, oldest-first left to right:
// - `resolved`: landed. Stays for `RESOLVED_LINGER_MS`, then disappears.
// - `in-flight`: being sent right now.
// - `retrying`: has failed at least once and is waiting out its backoff
//   (or is being re-sent). Everything after it waits behind it.
// - `queued`: waiting its turn — either behind an earlier save (TanStack
//   Query reports a scope-blocked mutation as paused), or still in the
//   saver's debounce window, not yet handed to the mutation at all.

export type SaveDotState = 'queued' | 'in-flight' | 'retrying' | 'resolved'

/** The slice of a TanStack Query mutation's state this needs. */
export interface SaveMutationSnapshot {
  id: number
  status: 'idle' | 'pending' | 'success' | 'error'
  isPaused: boolean
  failureCount: number
}

export interface SaveDot {
  /** Stable React key — the mutation id, or `'held'` for the debounced batch. */
  key: string
  state: SaveDotState
}

export const RESOLVED_LINGER_MS = 2000

/** Above this many dots, the oldest resolved ones are dropped first, then the rest collapse into a `+N` count. */
export const MAX_SAVE_DOTS = 14

function pendingDotState(m: SaveMutationSnapshot): SaveDotState {
  if (m.failureCount > 0) return 'retrying'
  return m.isPaused ? 'queued' : 'in-flight'
}

/**
 * Records when each successful mutation was first seen, so its dot can
 * linger and then expire. Mutates and returns `resolvedAt`. Pass
 * `now = -Infinity` to mark successes as already expired — for the ones
 * already in the cache when the indicator mounts, which landed some
 * unknown time ago.
 */
export function noteResolved(
  mutations: readonly SaveMutationSnapshot[],
  resolvedAt: Map<number, number>,
  now: number,
): Map<number, number> {
  for (const m of mutations) {
    if (m.status === 'success' && !resolvedAt.has(m.id)) {
      resolvedAt.set(m.id, now)
    }
  }
  return resolvedAt
}

export interface SaveDots {
  dots: SaveDot[]
  /** Dots that didn't fit under `MAX_SAVE_DOTS` (never resolved ones — those are dropped instead). */
  overflow: number
  /** When the next visible resolved dot expires, if any — the caller re-renders then. */
  nextExpiryAt: number | undefined
}

/**
 * The dots to show, oldest first. `mutations` must be in submission order
 * (the mutation cache's own order). `held` is whether the debounced saver
 * is still holding a network batch it hasn't sent yet — always the newest.
 * An `'error'` or `'idle'` mutation gets no dot: saves retry forever, so
 * neither happens in practice.
 */
export function deriveSaveDots(
  mutations: readonly SaveMutationSnapshot[],
  resolvedAt: ReadonlyMap<number, number>,
  held: boolean,
  now: number,
): SaveDots {
  const resolved: SaveDot[] = []
  const unresolved: SaveDot[] = []
  let nextExpiryAt: number | undefined
  for (const m of mutations) {
    if (m.status === 'pending') {
      unresolved.push({ key: String(m.id), state: pendingDotState(m) })
      continue
    }
    const seenAt = m.status === 'success' ? resolvedAt.get(m.id) : undefined
    if (seenAt === undefined) continue
    const expiresAt = seenAt + RESOLVED_LINGER_MS
    if (expiresAt <= now) continue
    resolved.push({ key: String(m.id), state: 'resolved' })
    nextExpiryAt = Math.min(nextExpiryAt ?? expiresAt, expiresAt)
  }
  if (held) unresolved.push({ key: 'held', state: 'queued' })

  const resolvedRoom = Math.max(0, MAX_SAVE_DOTS - unresolved.length)
  const shownResolved = resolved.slice(resolved.length - resolvedRoom)
  const shownUnresolved = unresolved.slice(0, MAX_SAVE_DOTS)
  return {
    dots: [...shownResolved, ...shownUnresolved],
    overflow: unresolved.length - shownUnresolved.length,
    nextExpiryAt,
  }
}
