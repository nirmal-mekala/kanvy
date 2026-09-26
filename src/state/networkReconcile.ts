// Wires api/networkOps.ts's "a create's real id is now known" moment into
// canonical app state (ctx/notes/260925-network-id-reconciliation.md) —
// the replacement for the old session-lifetime IdRemapTable side table.
//
// This module deliberately never imports state/history/boardHistoryAtom.ts
// or router.tsx directly: boardHistoryAtom.ts itself imports api/boardApi.ts
// (for its network save path), which imports api/networkOps.ts, which
// imports this module — a static import back to either of those would
// close that cycle on itself (fallow audit flagged exactly this the first
// time this module tried it). Instead, both register themselves here once,
// at their own module scope, via `registerReconcileTargets`/
// `registerBoardNavigator` — this module only ever calls what's registered.

import { getDefaultStore, type PrimitiveAtom } from 'jotai'
import type { Board } from '../schema/board'
import { currentBoardIdAtom } from './atoms/currentBoard'
import { selectionAtom } from './atoms/selection'
import {
  type RemapKind,
  reconcileEntityId,
  reconcileHistoryIds,
} from './entityReconcile'
import type { HistoryState } from './history/reducer'
import type { AttributedOps } from './ops'

let navigateToBoardId: ((boardId: string) => void) | undefined

/** Called once by router.tsx, at its own module scope — see module comment for why this is a registration instead of a direct import. */
export function registerBoardNavigator(fn: (boardId: string) => void): void {
  navigateToBoardId = fn
}

let reconcileTargets:
  | {
      currentBoardAtom: PrimitiveAtom<Board>
      boardHistoryAtom: PrimitiveAtom<HistoryState<AttributedOps>>
    }
  | undefined

/** Called once by state/history/boardHistoryAtom.ts, at its own module scope, right after defining these atoms — see module comment. */
export function registerReconcileTargets(
  currentBoardAtomRef: PrimitiveAtom<Board>,
  boardHistoryAtomRef: PrimitiveAtom<HistoryState<AttributedOps>>,
): void {
  reconcileTargets = {
    currentBoardAtom: currentBoardAtomRef,
    boardHistoryAtom: boardHistoryAtomRef,
  }
}

/**
 * Rewrites `oldId` to `newId` everywhere it's already load-bearing in live
 * app state — the board itself, the undo/redo history, the current-board
 * tracking, the route, and selection — so nothing downstream ever needs to
 * resolve `oldId` through a side table again. Called once, immediately,
 * the instant a network create's real id is known (api/networkOps.ts) —
 * not debounced, so the window where anything could still reference the
 * stale id is as small as possible. A no-op (besides the `oldId === newId`
 * guard) until `registerReconcileTargets` has run — true only during
 * boardHistoryAtom.ts's own module initialization, before any network op
 * could possibly have fired yet.
 */
export const reconcileNetworkEntityIdAtom = (
  kind: RemapKind,
  oldId: string,
  newId: string,
): void => {
  if (oldId === newId || !reconcileTargets) return
  const store = getDefaultStore()
  const { currentBoardAtom, boardHistoryAtom } = reconcileTargets

  store.set(currentBoardAtom, (board) =>
    reconcileEntityId(board, kind, oldId, newId),
  )
  store.set(boardHistoryAtom, (history) =>
    reconcileHistoryIds(history, kind, oldId, newId),
  )

  const selection = store.get(selectionAtom)
  if (selection.has(oldId)) {
    const next = new Set(selection)
    next.delete(oldId)
    next.add(newId)
    store.set(selectionAtom, next)
  }

  if (kind === 'board' && store.get(currentBoardIdAtom) === oldId) {
    store.set(currentBoardIdAtom, newId)
    navigateToBoardId?.(newId)
  }
}
