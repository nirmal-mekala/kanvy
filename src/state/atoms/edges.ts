// Granular per-edge read access + edge-affecting board operations. See
// nodes.ts for why `edgeFamily(id)` is a derived read atom rather than a
// primitive per-entity atom.

import { atom } from 'jotai'
import type { Board } from '../../schema/board'
import type { Edge } from '../../schema/edge'
import { boardAtom, updateBoardAtom } from '../history/boardHistoryAtom'
import { atomFamily } from './atomFamily'

export const edgeIdsAtom = atom((get) =>
  get(boardAtom).edges.map((edge) => edge.id),
)

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

export const addEdgeAtom = atom(null, (_get, set, edge: Edge) => {
  set(updateBoardAtom, (board: Board) => ({
    ...board,
    edges: [...board.edges, edge],
  }))
})

export const updateEdgeAtom = atom(
  null,
  (_get, set, id: string, patch: Partial<Edge>) => {
    const now = new Date().toISOString()
    set(updateBoardAtom, (board: Board) => {
      let changed = false
      const edges = board.edges.map((edge) => {
        if (edge.id !== id) return edge
        changed = true
        return { ...edge, ...patch, updatedAt: now }
      })
      return changed ? { ...board, edges } : board
    })
  },
)
