// Jotai wiring around the pure history reducer (./reducer.ts) for the
// Board, plus the autosave wiring the phase 5 plan's Stage 2 assigns
// here: every board mutation goes through `updateBoardAtom`, which both
// records an undo step and (debounced) persists to localStorage — unless
// a corrupt-data recovery (spec §9/Q12) is still unacknowledged, in which
// case autosave stays suppressed so the original bad bytes are never
// clobbered before the user has had a chance to see what happened. A
// later UI stage surfaces `boardLoadResultAtom` and calls
// `acknowledgeRecoveryAtom` once the user has seen that notification.
//
// Schema v4 (ctx/notes/260921-action-based-undo-and-tombstoning.md §2a):
// each history entry now stores the *ops* a step applied (`AttributedOps`)
// rather than a whole `Board` snapshot. The live, materialized board lives
// in a separate `currentBoardAtom` that isn't itself part of the undo
// stack — `updateBoardAtom` advances it by applying ops forward
// (`applyOps(..., 'after')`), and `undoBoardAtom`/`redoBoardAtom` move it
// backward/forward by applying the relevant entry's ops against it
// (`'before'`/`'after'`). Each entry's `ops` are relative to whichever
// board immediately preceded it, not absolute — so `present.state.ops` is
// always exactly "what to undo to get to what `past.at(-1)` represents,"
// and multi-step undo/redo just walks this chain one entry at a time,
// same as the old whole-snapshot model did by swapping in a stored board.
//
// Multiboard support (ctx/notes/260917-multiboard-support-design.md §5):
// since `nodes`/`edges` are shared flat arrays across all boards, each
// history entry is necessarily attributed to one board, not sliced
// per-board — there's no way to give each board a fully independent
// undo/redo stack without breaking cross-board atomic actions (e.g.
// duplicating a board node on the home board, which creates an entirely
// new child board's content in the same step — undoing it must revert
// both at once, which a per-board-sliced revert can't do correctly). The
// reducer/stack itself is therefore one flat past/present/future, same as
// before multiboard — every entry is just additionally tagged with the
// boardId the action was attributed to (ctx/notes/260917-multiboard-
// implementation-plan.md §4), and undo/redo are *gated*: they only act if
// the entry they'd act on belongs to the board currently being viewed. In
// practice (since only one board is ever editable at a time) this means
// undo/redo always affect whichever board was most recently edited, in
// true chronological order — editing board B after board A makes A's undo
// unavailable until A is edited again.

import { MutationObserver } from '@tanstack/react-query'
import { atom, getDefaultStore } from 'jotai'
import { fetchBoard, saveBoard, saveBoardOverNetwork } from '../../api/boardApi'
import { queryClient } from '../../api/queryClient'
import type { Board } from '../../schema/board'
import { ROOT_BOARD_ID } from '../../schema/boardMeta'
import { currentBoardIdAtom } from '../atoms/currentBoard'
import { accessModeAtom, networkConfigAtom } from '../atoms/networkSettings'
import { selectionAtom } from '../atoms/selection'
import { pushToastAtom } from '../atoms/toasts'
import {
  applyOps,
  type Direction,
  mergeOpLists,
  type Op,
  type ReplaceBoardOp,
} from '../ops'
import {
  createDebouncedSaver,
  type LoadResult,
  loadBoard,
} from '../persistence/storage'
import { reapEntities } from '../reaper'
import {
  createHistoryState,
  type HistoryState,
  pushUpdate,
  redo as redoReducer,
  undo as undoReducer,
} from './reducer'

/** The ops a step applied plus which board's action produced it — the unit `reducer.ts`'s generic history stack is instantiated over here (schema v4). */
interface AttributedOps {
  ops: Op[]
  boardId: string
}

function mergeAttributedOps(
  prev: AttributedOps,
  next: AttributedOps,
): AttributedOps {
  return { ops: mergeOpLists(prev.ops, next.ops), boardId: next.boardId }
}

/**
 * The debounced saver's payload — `ops`/`direction`/`boardId` describe
 * *what happened*, so the TanStack Query mutation's `variables` (visible
 * in its Devtools Mutations tab) show a real action, not just the
 * resulting board. `board` is still the thing actually persisted (rather
 * than having `saveBoard` re-derive it by reapplying `ops` to its own
 * separately-tracked copy) — that keeps the write itself exactly as
 * robust as before this existed, at the cost of `board` also showing up
 * in the mutation's variables alongside `ops`.
 */
interface PendingSave {
  ops: Op[]
  direction: Direction
  boardId: string
  board: Board
}

/**
 * Only ever called with same-`direction`/same-`boardId` pending saves in
 * practice: `updateBoardAtom` is the only caller that can accumulate
 * across calls (always `direction: 'after'`, and it flushes first itself
 * — see its own comment — whenever `boardId` would otherwise change
 * mid-batch), and every other caller (undo/redo/import/recovery-ack)
 * flushes before its own `save`, so `pending` is always empty by the time
 * they call it and this never actually has to reconcile a mismatch.
 */
function mergePendingSave(prev: PendingSave, next: PendingSave): PendingSave {
  return {
    ops: mergeOpLists(prev.ops, next.ops),
    direction: next.direction,
    boardId: next.boardId,
    board: next.board,
  }
}

const initialLoad: LoadResult = loadBoard()

// Local-mode read-path parity (network mode design doc §6d): the actual
// initial load above stays a synchronous localStorage read — this app has
// never shown a loading state for it, and there's no reason to introduce
// one now — but it's *also* pushed through the same TanStack Query cache
// network mode's reads use (fetchBoard, api/boardApi.ts, already existed
// as an unused async wrapper around this same `loadBoard`), purely so
// local mode's read path is visible in the same query-driven shape/
// Devtools view as network mode's, per the design doc's explicit read/
// write parity ask. `void` — this is fire-and-forget priming, nothing
// awaits it.
void queryClient.prefetchQuery({
  queryKey: ['board', 'local'] as const,
  queryFn: fetchBoard,
})

// Routes the debounced saver's actual write through the TanStack Query
// mutation layer (src/api/boardApi.ts) instead of localStorage directly —
// `MutationObserver` is TanStack Query's supported way to dispatch a
// mutation imperatively, outside a React component (this module isn't
// one; same reason router.tsx's `beforeLoad` reads jotai's default store
// directly rather than via a hook). `createDebouncedSaver`'s own
// debounce/flush/cancel mechanics are unchanged — only what a flush
// ultimately calls is swapped, so batching still happens at the
// history-entry (gesture) granularity its 500ms window already gives.
// `mutationKey` labels every row in Devtools' Mutations tab; `pending.ops`
// (visible by expanding a row's variables) is what actually identifies
// each one as a real action, not just "a board got saved."
const saveMutation = new MutationObserver(queryClient, {
  mutationKey: ['board', 'save'],
  // Mode-aware (network mode design doc §5): reads the current mode/config
  // fresh at mutate time (not captured once at module scope), since
  // settings can change between one save and the next. Network mode maps
  // `pending.ops` onto real per-entity REST calls instead of a
  // whole-document write; local mode's own behavior is unchanged.
  mutationFn: (pending: PendingSave) => {
    const store = getDefaultStore()
    if (store.get(accessModeAtom) === 'network') {
      return saveBoardOverNetwork(store.get(networkConfigAtom), pending.ops)
    }
    return saveBoard(pending.board)
  },
})
const saver = createDebouncedSaver<PendingSave>(
  undefined,
  (pending) => {
    saveMutation.mutate(pending).catch(() => {
      // Surfaced via a toast (state/atoms/toasts.ts) rather than silently
      // swallowed — now that saves route through the TanStack Query
      // mutation layer's simulated flaky network (src/api/boardApi.ts's
      // `VITE_MOCK_ERROR_RATE`), a real failure is something the dev-mode
      // save path can actually exercise, not just a theoretical
      // localStorage-quota edge case (that one — writeBoard's own catch —
      // stays silent, spec §9/Q13's explicit out-of-scope-for-v0 call).
      // No retry: this app doesn't currently configure one (React Query
      // v5's mutation default is `retry: 0`), so the message doesn't
      // claim it'll happen automatically.
      getDefaultStore().set(
        pushToastAtom,
        'An error occurred during save; please try again.',
      )
    })
  },
  mergePendingSave,
)

/** The result of the initial localStorage load — `ok: false` means a corrupt-data recovery happened. */
export const boardLoadResultAtom = atom<LoadResult>(initialLoad)

/** Gates autosave (spec §9/Q12) — starts true unless the initial load was a recovery. */
export const recoveryAcknowledgedAtom = atom(initialLoad.ok)

/**
 * The non-home board a brand-new user should be dropped into, set only
 * when this session's initial load minted a fresh seed document. The `/`
 * route's `beforeLoad` (router.tsx) consumes this once — redirecting to it
 * and clearing it back to `undefined` — so a later, deliberate visit to `/`
 * behaves normally.
 */
export const freshBoardIdAtom = atom<string | undefined>(
  initialLoad.ok ? initialLoad.freshBoardId : undefined,
)

// On-load tombstone reaper (state/reaper.ts, design doc §5/§7; extended to
// nodes/edges/images by schema v4, ctx/notes/260921-action-based-undo-and-
// tombstoning.md): permanently frees trashed content once its tombstone is
// old enough that an accidental delete has had ample time to be noticed.
// Applied directly to the initial board *before* history is created —
// reaping isn't a user action and must never itself become an undo step
// (undoing it would silently resurrect content the reaper just decided
// was safe to free). If nothing's reapable this is a no-op (same
// reference back).
const initialBoard = reapEntities(initialLoad.board, Date.now())

export const boardHistoryAtom = atom<HistoryState<AttributedOps>>(
  createHistoryState({ ops: [], boardId: ROOT_BOARD_ID }),
)

/** The live, materialized board — advanced by `updateBoardAtom`/undo/redo applying ops against it, not itself part of the undo stack (see module comment). */
export const currentBoardAtom = atom<Board>(initialBoard)

export const boardAtom = atom((get) => get(currentBoardAtom))

function autosaveIfAcknowledged(
  get: (a: typeof recoveryAcknowledgedAtom) => boolean,
  pending: PendingSave,
): void {
  if (get(recoveryAcknowledgedAtom)) saver.save(pending)
}

/**
 * Applies `ops` as the next undo step, attributed to `boardId` (the board
 * the action was performed from — design doc §5's attribution rule).
 * `restoreSelection` (spec §8/Q11) is only meaningful for actions like
 * delete, where undoing should re-select what was restored. An empty
 * `ops` array is a no-op — a mutation atom builds ops only for entities it
 * actually touched, so "nothing to apply" is the authoritative signal,
 * same role the old whole-board-updater's reference-equality check
 * played. Coalescing (the 400ms rapid-fire window, spec §8/Q10) is forced
 * off whenever `boardId` differs from the present entry's own attribution
 * — two rapid edits to different boards must never merge into one entry
 * (see reducer.ts's `forceNewEntry` doc) — and, when it does apply, merges
 * `ops` into the current entry's own ops (`mergeAttributedOps`) rather
 * than replacing them, since an ops entry (unlike the old whole-`Board`
 * snapshot) doesn't already contain everything a later increment in the
 * same gesture touched. The pending *save* respects the same boundary —
 * flushed first whenever `boardId` changes — so `mergePendingSave` never
 * has to reconcile ops from two different boards into one mutation.
 */
export const updateBoardAtom = atom(
  null,
  (
    get,
    set,
    boardId: string,
    ops: Op[],
    restoreSelection?: readonly string[],
  ) => {
    if (ops.length === 0) return
    const nextBoard = applyOps(get(currentBoardAtom), ops, 'after')
    set(currentBoardAtom, nextBoard)
    const history = get(boardHistoryAtom)
    const forceNewEntry = boardId !== history.present.state.boardId
    if (forceNewEntry) saver.flush()
    const nextHistory = pushUpdate(
      history,
      { ops, boardId },
      Date.now(),
      restoreSelection,
      forceNewEntry,
      mergeAttributedOps,
    )
    set(boardHistoryAtom, nextHistory)
    autosaveIfAcknowledged(get, {
      ops,
      direction: 'after',
      boardId,
      board: nextBoard,
    })
  },
)

/** Acknowledges a corrupt-data recovery notification and resumes autosave — persisted as a force-overwrite (`ReplaceBoardOp` with `before === after`) since there's no prior *valid* board to diff against (the corrupt bytes it's replacing aren't a `Board`). */
export const acknowledgeRecoveryAtom = atom(null, (get, set) => {
  set(recoveryAcknowledgedAtom, true)
  const board = get(boardAtom)
  const op: ReplaceBoardOp = {
    kind: 'replace-board',
    before: board,
    after: board,
  }
  saver.save({
    ops: [op],
    direction: 'after',
    boardId: get(currentBoardIdAtom),
    board,
  })
  saver.flush()
})

/** Undoes the current board's own most recent action — a no-op if the top of the stack was attributed to a different board (i.e. that board was edited more recently than this one), or if there's nothing to undo. */
export const undoBoardAtom = atom(null, (get, set) => {
  const history = get(boardHistoryAtom)
  if (history.present.state.boardId !== get(currentBoardIdAtom)) return
  const result = undoReducer(history)
  if (result.history === history) return
  const { ops, boardId } = history.present.state
  const prevBoard = applyOps(get(currentBoardAtom), ops, 'before')
  set(currentBoardAtom, prevBoard)
  set(boardHistoryAtom, result.history)
  if (result.restoreSelection) {
    set(selectionAtom, new Set(result.restoreSelection))
  }
  // Undo is its own complete action, not part of whatever forward-edit
  // gesture might still be debounced — flush that first so its ops are
  // never silently dropped, then send undo's own ops (applied 'before')
  // as their own immediately-flushed mutation.
  saver.flush()
  autosaveIfAcknowledged(get, {
    ops,
    direction: 'before',
    boardId,
    board: prevBoard,
  })
  saver.flush()
})

/** Redoes the current board's own most recently undone action — a no-op if the next future entry was attributed to a different board, or if there's nothing to redo. */
export const redoBoardAtom = atom(null, (get, set) => {
  const history = get(boardHistoryAtom)
  const next = history.future[0]
  if (!next || next.state.boardId !== get(currentBoardIdAtom)) return
  const { ops, boardId } = next.state
  const nextBoard = applyOps(get(currentBoardAtom), ops, 'after')
  set(currentBoardAtom, nextBoard)
  set(boardHistoryAtom, redoReducer(history))
  // Same reasoning as undoBoardAtom — its own immediate mutation.
  saver.flush()
  autosaveIfAcknowledged(get, {
    ops,
    direction: 'after',
    boardId,
    board: nextBoard,
  })
  saver.flush()
})

/**
 * Replaces the whole board with an imported one (spec §9/Q14) — goes
 * through the normal undo path, so an accidental import is just another
 * ⌘/Ctrl+Z away from being undone, same as any other mutation. Import can
 * change every top-level collection at once, wholesale, so this is the one
 * op that isn't a per-entity create/update (`ops.ts`'s `ReplaceBoardOp`) —
 * diffing it down to per-entity ops would be exactly the auto-diff
 * approach the design doc's developer preference rejected for ordinary
 * mutations. Always its own history entry (`forceNewEntry: true`), so it's
 * never merged with anything. Attributed to whichever board was being
 * viewed when the import happened (import/export operate on the whole app
 * document, per ctx/notes/260917-multiboard-implementation-plan.md §1's
 * Q1 — there's no more specific board to attribute it to).
 */
export const loadImportedBoardAtom = atom(null, (get, set, board: Board) => {
  const boardId = get(currentBoardIdAtom)
  const prevBoard = get(currentBoardAtom)
  if (board === prevBoard) return
  set(currentBoardAtom, board)
  const history = get(boardHistoryAtom)
  const op: ReplaceBoardOp = {
    kind: 'replace-board',
    before: prevBoard,
    after: board,
  }
  const ops: Op[] = [op]
  set(
    boardHistoryAtom,
    pushUpdate(
      history,
      { ops, boardId },
      Date.now(),
      undefined,
      true,
      mergeAttributedOps,
    ),
  )
  // Its own complete action, same reasoning as undo/redo above.
  saver.flush()
  autosaveIfAcknowledged(get, { ops, direction: 'after', boardId, board })
  saver.flush()
})
