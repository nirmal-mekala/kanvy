// localStorage load/save (spec §9). This is the only side-effecting
// boundary in the persistence layer — everything it delegates to
// (schema/legacy.ts, schema/board.ts, serialize.ts) is pure.
//
// Corrupt/unreadable data handling (spec §9 Q12): `loadBoard` never
// throws and always returns a usable board (falling back to the seed
// board), but when the persisted data was corrupt it reports that via
// `ok: false` rather than silently recovering. It deliberately does NOT
// write the seed board back to storage itself — a later UI stage is
// responsible for surfacing the recovery to the user and must not call
// `writeBoard`/a `DebouncedSaver.save` until that's acknowledged, so the
// original bytes stay inspectable/exportable until then.

import type { Board } from '../../schema/board'
import { BoardSchema } from '../../schema/board'
import { normalizeLegacyBoard } from '../../schema/legacy'
import { createSeedBoard } from '../../schema/seed'
import { serializeBoard } from './serialize'

export const STORAGE_KEY = 'kanvy.board'

export type LoadResult =
  | {
      ok: true
      board: Board
      /** Set only when this load minted a brand-new seed document — the non-home board a first-time visit should be routed to (router.tsx's `/` route). Absent for a returning user's stored board, and absent on the corrupt-data recovery paths below (that's a recovery, not onboarding). */
      freshBoardId?: string
    }
  | {
      ok: false
      board: Board
      reason: 'parse-error' | 'validation-error'
      raw: string
    }

function validateParsed(parsed: unknown): Board | undefined {
  const result = BoardSchema.safeParse(normalizeLegacyBoard(parsed))
  return result.success ? result.data : undefined
}

/** Loads and validates the persisted board, falling back to a fresh seed board. */
export function loadBoard(): LoadResult {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    // localStorage unavailable (e.g. disabled in the browser) — same
    // fallback as "nothing saved yet", not a reportable corruption.
    const { board, welcomeBoardId } = createSeedBoard()
    return { ok: true, board, freshBoardId: welcomeBoardId }
  }

  if (raw === null) {
    const { board, welcomeBoardId } = createSeedBoard()
    return { ok: true, board, freshBoardId: welcomeBoardId }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      ok: false,
      board: createSeedBoard().board,
      reason: 'parse-error',
      raw,
    }
  }

  const board = validateParsed(parsed)
  if (!board) {
    return {
      ok: false,
      board: createSeedBoard().board,
      reason: 'validation-error',
      raw,
    }
  }
  return { ok: true, board }
}

/** Immediate, unconditional write. Callers own the "don't autosave over corrupt data" gate. */
export function writeBoard(board: Board): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeBoard(board))
  } catch {
    // Storage-quota-exceeded etc.: accepted silent failure for v0, matching
    // today's behavior (spec §9 Q13) — not a first-class error state yet.
  }
}

export interface DebouncedSaver<T = Board> {
  save: (value: T) => void
  /** Writes the most recent pending value immediately, if any, and clears the timer. */
  flush: () => void
  /** Drops any pending save without writing it. */
  cancel: () => void
}

const DEFAULT_DEBOUNCE_MS = 500

/**
 * Hand-rolled debounce (no lodash/use-debounce dependency, per phase3 stack
 * decision), generic over the value being debounced (defaults to `Board`
 * for the original localStorage-write use case). `write`, when given,
 * replaces the actual write call — used by state/history/
 * boardHistoryAtom.ts to route saves through the TanStack Query mutation
 * layer (src/api/boardApi.ts) instead of writing localStorage directly,
 * while keeping this module's own debounce/flush/cancel mechanics as the
 * single source of truth for save batching.
 *
 * `merge`, when given, combines a still-pending value with a newly-saved
 * one instead of the default last-write-wins replace — used by
 * boardHistoryAtom.ts to accumulate the ops from several rapid edits
 * (same shape as reducer.ts's `pushUpdate` `merge` param, for the same
 * reason: an ops-based payload doesn't already contain everything a later
 * increment touched, unlike a plain value that can just be replaced).
 */
export function createDebouncedSaver<T = Board>(
  delayMs = DEFAULT_DEBOUNCE_MS,
  write: (value: T) => void = writeBoard as unknown as (value: T) => void,
  merge?: (prev: T, next: T) => T,
): DebouncedSaver<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: T | undefined

  const flush = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    if (pending !== undefined) write(pending)
    pending = undefined
  }

  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    pending = undefined
  }

  const save = (value: T) => {
    pending = pending === undefined || !merge ? value : merge(pending, value)
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(flush, delayMs)
  }

  return { save, flush, cancel }
}
