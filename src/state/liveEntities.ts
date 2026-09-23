// Single encapsulation point for "is this entity live (not tombstoned)?"
// (schema v4, ctx/notes/260921-action-based-undo-and-tombstoning.md). Every
// reader of `board.nodes`/`board.edges`/`board.boards` as "the live set"
// must filter through here rather than re-deriving its own `status` check —
// the design doc explicitly flags this pattern as easy to miss at a new
// call site otherwise.

import type { Board } from '../schema/board'
import type { Edge } from '../schema/edge'
import type { Node } from '../schema/node'

interface Tombstonable {
  status: 'active' | 'trashed'
}

export function isLive(entity: Tombstonable): boolean {
  return entity.status !== 'trashed'
}

/** Live (non-trashed) nodes belonging to `boardId`, in array order. */
export function getLiveNodes(board: Board, boardId: string): Node[] {
  return board.nodes.filter((node) => node.boardId === boardId && isLive(node))
}

/** Live (non-trashed) edges belonging to `boardId`, in array order. */
export function getLiveEdges(board: Board, boardId: string): Edge[] {
  return board.edges.filter((edge) => edge.boardId === boardId && isLive(edge))
}

/**
 * The `index` (schema v4 Q4) a newly-appended live node on `boardId`
 * should get — one past the board's current live count. `index` is typed
 * as a float for future fractional-indexing inserts (see schema/node.ts),
 * but appending to the end never needs a fraction — this always returns
 * a whole number.
 */
export function nextNodeIndex(board: Board, boardId: string): number {
  return getLiveNodes(board, boardId).length
}
