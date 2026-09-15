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

/**
 * The next selection after a plain (non-marquee) click on `id` (spec §4.3):
 * - additive (shift/ctrl/cmd+click): toggles `id` in the current selection.
 * - clicking a card/container already part of a multi-selection keeps the
 *   whole group intact (so it can be dragged as one) rather than
 *   collapsing to just `id`.
 * - otherwise: selects only `id`.
 */
export function computeSelectionAfterClick(
  current: ReadonlySet<SelectableId>,
  id: SelectableId,
  additive: boolean,
): Set<SelectableId> {
  if (additive) {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }
  if (current.has(id) && current.size > 1) return new Set(current)
  return new Set([id])
}
