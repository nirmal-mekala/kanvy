// Current selection (spec §4.3) — a plain (non-history-tracked) atom. Only
// the specific spec §8/Q11 fix (undoing a delete re-selects what it
// restored) needs history to interact with selection at all; that's wired
// from src/state/history/boardHistoryAtom.ts's undo action, not by putting
// selection inside the undo stack generally.

import { atom } from 'jotai'
import type { NodeId } from '../../schema/node'

type SelectableId = NodeId | string // NodeId or Edge id

export const selectionAtom = atom<ReadonlySet<SelectableId>>(
  new Set<SelectableId>(),
)

export const setSelectionAtom = atom(
  null,
  (_get, set, ids: Iterable<SelectableId>) => {
    set(selectionAtom, new Set(ids))
  },
)

export const clearSelectionAtom = atom(null, (_get, set) => {
  set(selectionAtom, new Set())
})
