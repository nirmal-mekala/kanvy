// Granular per-edge read access + edge-affecting board operations. See
// nodes.ts for why `edgeFamily(id)` is a derived read atom rather than a
// primitive per-entity atom. `edgeIdsAtom` scopes itself to
// `currentBoardIdAtom` (multiboard support, ctx/notes/260917-multiboard-
// support-design.md §2) the same way `nodeIdsAtom` does; `addEdgeAtom`
// stamps the new edge's `boardId` to the current board, same as
// `addNodeAtom` does for nodes.

import { atom } from 'jotai'
import type { Edge } from '../../schema/edge'
import { boardAtom, updateBoardAtom } from '../history/boardHistoryAtom'
import { getLiveEdges } from '../liveEntities'
import type { Op } from '../ops'
import { atomFamily } from './atomFamily'
import { currentBoardIdAtom } from './currentBoard'

export const edgeIdsAtom = atom((get) => {
  const currentBoardId = get(currentBoardIdAtom)
  return getLiveEdges(get(boardAtom), currentBoardId).map((edge) => edge.id)
})

export const edgeFamily = atomFamily((id: string) =>
  atom((get) => get(boardAtom).edges.find((edge) => edge.id === id)),
)

/**
 * At most one edge between any given unordered pair of nodes (spec §4.6) —
 * the existing edge (if any), so a caller can select it instead of drawing
 * a duplicate.
 */
export function findEdgeBetween(
  edges: readonly Edge[],
  nodeIdA: string,
  nodeIdB: string,
): Edge | undefined {
  return edges.find(
    (edge) =>
      (edge.fromNodeId === nodeIdA && edge.toNodeId === nodeIdB) ||
      (edge.fromNodeId === nodeIdB && edge.toNodeId === nodeIdA),
  )
}

export const addEdgeAtom = atom(null, (get, set, edge: Edge) => {
  const boardId = get(currentBoardIdAtom)
  const stamped = { ...edge, boardId }
  set(updateBoardAtom, boardId, [
    { kind: 'create', entity: 'edge', value: stamped },
  ])
})

/**
 * Sets `direction` on every edge in `ids` in one history step (spec §4.6's
 * selection-menu direction toggle) — a single-element `ids` array covers
 * the single-selected-edge case too, so there's no separate one-id action.
 */
export const setEdgeDirectionAtom = atom(
  null,
  (get, set, ids: readonly string[], direction: Edge['direction']) => {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    const now = new Date().toISOString()
    const board = get(boardAtom)
    const ops: Op[] = []
    for (const edge of board.edges) {
      if (!idSet.has(edge.id) || edge.direction === direction) continue
      ops.push({
        kind: 'update',
        entity: 'edge',
        id: edge.id,
        before: { direction: edge.direction, updatedAt: edge.updatedAt },
        after: { direction, updatedAt: now },
      })
    }
    if (ops.length === 0) return
    set(updateBoardAtom, get(currentBoardIdAtom), ops)
  },
)
