// Deep-copy for duplicating/pasting a `board`-kind card (multiboard
// support design doc §3): unlike every other node kind, a shallow "copy
// the node, give it a fresh id" (clipboard/duplicateNodes.ts's and
// nodeClipboard.ts's normal behavior) is wrong here — two board nodes
// can't both reference the same `boards` entry (design doc §2: "each
// board... has exactly one board-node instance"). So this mints an
// entirely fresh board and deep-copies every node/edge belonging to the
// source board along with it, one atomic unit per board node duplicated.

import type { Board } from '../schema/board'
import type { BoardMeta } from '../schema/boardMeta'
import type { Edge } from '../schema/edge'
import { generateId } from '../schema/legacy'
import type { BoardCard, Node } from '../schema/node'
import { getLiveEdges, getLiveNodes, isLive } from '../state/liveEntities'
import { nextCopyTitle } from './copyTitle'

export interface BoardDuplicationResult {
  /** Freshly-minted `boards` entries — one per board node duplicated. */
  boards: BoardMeta[]
  /** Every new node to append: each source board's deep-copied content, plus the new board-node cards standing in for them (design doc §3's on-root placeholder). */
  nodes: Node[]
  /** Deep-copied edges, endpoints remapped to the copied nodes' fresh ids. */
  edges: Edge[]
  /** The new board-node cards themselves, in the same order as `boardNodes` — a subset of `nodes`, surfaced separately for selection/pan-into-view/focus after the gesture (mirroring what `duplicateNodes`/`pasteFromNodeClipboardAtom` return for every other kind). */
  newBoardNodeCards: BoardCard[]
}

/**
 * Deep-copies each of `boardNodes`' referenced board (content and all),
 * placing the new board-node card at the original's position plus
 * `offset` — the same uniform-offset placement `duplicateNodes.ts`/
 * `nodeClipboard.ts` use for every other kind, so a mixed selection
 * (board nodes alongside containers) still displaces as one gesture.
 * Each new board's title is the source's with a " - Copy"/" - Copy N"
 * suffix (see `nextCopyTitle`), so duplicates stay distinguishable instead
 * of colliding on the source's exact title.
 */
export function duplicateBoardNodes(
  boardNodes: readonly BoardCard[],
  board: Board,
  offset: number,
): BoardDuplicationResult {
  const boards: BoardMeta[] = []
  const nodes: Node[] = []
  const edges: Edge[] = []
  const newBoardNodeCards: BoardCard[] = []
  // Existing (non-trashed — a tombstoned "X - Copy 2" frees up that number,
  // §2/§5's delete-is-a-tombstone mechanism) + already-minted-this-call
  // titles, so multiple board nodes duplicated in one gesture (e.g.
  // duplicating the same board twice via a multi-select) still get
  // distinct, incrementing copy numbers.
  const takenTitles = board.boards.filter(isLive).map((b) => b.title)

  for (const boardNode of boardNodes) {
    const now = new Date().toISOString()
    const sourceBoardId = boardNode.boardRef
    const sourceMeta = board.boards.find((b) => b.id === sourceBoardId)
    const newBoardId = generateId()
    const title = nextCopyTitle(
      sourceMeta?.title ?? 'Untitled board',
      takenTitles,
    )
    takenTitles.push(title)
    boards.push({
      id: newBoardId,
      title,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    // Live only (Q5/blast-radius): a duplicated board shouldn't deep-copy
    // its source's tombstones.
    const sourceNodes = getLiveNodes(board, sourceBoardId)
    const idMap = new Map(sourceNodes.map((n) => [n.id, generateId()]))
    for (const node of sourceNodes) {
      nodes.push({
        ...node,
        id: idMap.get(node.id) as string,
        boardId: newBoardId,
        createdAt: now,
        updatedAt: now,
      })
    }

    const sourceEdges = getLiveEdges(board, sourceBoardId)
    for (const edge of sourceEdges) {
      const fromNodeId = idMap.get(edge.fromNodeId)
      const toNodeId = idMap.get(edge.toNodeId)
      // Every edge's endpoints belong to the same board it does, so both
      // should always be in `idMap` — skip defensively rather than
      // produce a dangling reference if that invariant is ever violated.
      if (!fromNodeId || !toNodeId) continue
      edges.push({
        ...edge,
        id: generateId(),
        boardId: newBoardId,
        fromNodeId,
        toNodeId,
        createdAt: now,
        updatedAt: now,
      })
    }

    const duplicatedBoardCard: BoardCard = {
      ...boardNode,
      id: generateId(),
      boardRef: newBoardId,
      x: boardNode.x + offset,
      y: boardNode.y + offset,
      createdAt: now,
      updatedAt: now,
    }
    nodes.push(duplicatedBoardCard)
    newBoardNodeCards.push(duplicatedBoardCard)
  }

  return { boards, nodes, edges, newBoardNodeCards }
}
