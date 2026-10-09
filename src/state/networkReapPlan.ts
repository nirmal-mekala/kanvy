// The network-mode reaper's pure planning half
// (ctx/notes/261009-network-reaper-and-image-lifecycle.md): given what the
// server reported as reap candidates, decides what to hard-delete and in
// what order. api/networkReaper.ts fetches the candidates and executes the
// plan; nothing here does I/O.
//
// Semantics match the local reaper (state/reaper.ts), whose age rules are
// reused rather than forked: an aged, trashed board takes everything on it
// with it, regardless of that content's own status; aged, trashed nodes
// and edges go on their own. The ordering exists because a real backend
// may enforce foreign keys (e.g. `nodes.image_id → images ON DELETE
// RESTRICT`), so every delete comes after the deletes of whatever
// references it: edges, then nodes, then boards, then images.

import type { BoardMeta } from '../schema/boardMeta'
import type { Edge } from '../schema/edge'
import type { Node } from '../schema/node'
import { reapableBoardIds, reapableEdgeIds, reapableNodeIds } from './reaper'

/** Every aged, trashed board in `trashedBoards` — never the root board, which can't be trashed, but is guarded anyway. */
export function reapCandidateBoardIds(
  trashedBoards: readonly BoardMeta[],
  now: number,
): string[] {
  const rootIds = new Set(
    trashedBoards.filter((board) => board.isRoot).map((board) => board.id),
  )
  return reapableBoardIds(trashedBoards, now).filter((id) => !rootIds.has(id))
}

/** The server-side reap candidates the plan is built from (api/networkReaper.ts fetches each). */
export interface NetworkReapCandidates {
  /** `GET /boards?status=trashed`. */
  trashedBoards: readonly BoardMeta[]
  /** `GET /nodes?status=trashed`. */
  trashedNodes: readonly Node[]
  /** `GET /edges?status=trashed`. */
  trashedEdges: readonly Edge[]
  /** Every node, any status, on a `reapCandidateBoardIds` board. */
  boardNodes: readonly Node[]
  /** Every edge, any status, on a `reapCandidateBoardIds` board. */
  boardEdges: readonly Edge[]
  /** Every board card, any status, whose `boardRef` is a `reapCandidateBoardIds` board. */
  boardCards: readonly Node[]
  /** Every edge, any status, touching a `candidateNodeIds` node. */
  touchingEdges: readonly Edge[]
}

/**
 * Every node the plan could possibly delete (the aged, trashed ones plus
 * everything on a candidate board) — a superset of what it ends up
 * deleting, since a candidate board can still be skipped. The runner
 * fetches the edges touching these before planning.
 */
export function candidateNodeIds(
  candidates: Pick<NetworkReapCandidates, 'trashedNodes' | 'boardNodes'>,
  now: number,
): string[] {
  return [
    ...new Set([
      ...reapableNodeIds(candidates.trashedNodes, now),
      ...candidates.boardNodes.map((node) => node.id),
    ]),
  ]
}

export interface PlannedNodeDelete {
  id: string
  /** Edges that reference this node, deleted first. */
  edgeIds: string[]
  /** The image this node references, if it's an image card — an image-deletion candidate once this node is gone. */
  imageId: string | undefined
}

export interface PlannedBoardDelete {
  id: string
  /** Nodes on this board, or board cards pointing at it, deleted first. */
  nodeIds: string[]
  /** Edges on this board, deleted first. */
  edgeIds: string[]
}

/** An aged, trashed board the plan leaves alone, and why. */
interface SkippedBoard {
  id: string
  reason: string
}

/**
 * The ordered delete plan: every `edgeIds` entry first, then `nodes`, then
 * `boards`. The runner deletes a node only once all its `edgeIds`
 * deletes have succeeded, and a board only once all its `nodeIds` and
 * `edgeIds` deletes have. Images aren't planned up front:
 * `imageCandidateIds` derives them from the nodes actually deleted.
 */
export interface NetworkReapPlan {
  edgeIds: string[]
  nodes: PlannedNodeDelete[]
  boards: PlannedBoardDelete[]
  skippedBoards: SkippedBoard[]
}

function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}

/** Nodes to delete given which boards are being reaped: aged, trashed nodes plus everything on a reaped board. */
function nodesToDelete(
  candidates: NetworkReapCandidates,
  boardIds: ReadonlySet<string>,
  now: number,
): Node[] {
  const reapable = new Set(reapableNodeIds(candidates.trashedNodes, now))
  return uniqueById([
    ...candidates.trashedNodes.filter((node) => reapable.has(node.id)),
    ...candidates.boardNodes.filter((node) => boardIds.has(node.boardId)),
  ])
}

function referencedBoardId(node: Node): string | undefined {
  return node.nodeType === 'card' && node.cardType === 'board'
    ? node.boardRef
    : undefined
}

/**
 * Candidate boards that some board card outside the delete set still
 * points at. Deleting one would leave a dangling `boardRef` (or be
 * rejected by a foreign key). A live card pointing at an aged, trashed
 * board shouldn't happen (deleting a board trashes its cards at the same
 * instant), so it's skipped rather than guessed at.
 */
function boardsStillReferenced(
  candidates: NetworkReapCandidates,
  boardIds: ReadonlySet<string>,
  nodeIds: ReadonlySet<string>,
): SkippedBoard[] {
  const skipped = new Map<string, SkippedBoard>()
  for (const card of candidates.boardCards) {
    const boardId = referencedBoardId(card)
    if (boardId === undefined || !boardIds.has(boardId)) continue
    if (nodeIds.has(card.id) || skipped.has(boardId)) continue
    skipped.set(boardId, {
      id: boardId,
      reason: `still referenced by ${card.status} board card ${card.id}`,
    })
  }
  return [...skipped.values()]
}

/**
 * Settles which candidate boards are reaped. Skipping a board keeps its
 * content, which can keep a board card on it alive, which can in turn
 * skip the board *that* card points at — so this repeats until nothing
 * new is skipped.
 */
function settleBoards(
  candidates: NetworkReapCandidates,
  now: number,
): { boardIds: Set<string>; nodes: Node[]; skippedBoards: SkippedBoard[] } {
  const boardIds = new Set(reapCandidateBoardIds(candidates.trashedBoards, now))
  const skippedBoards: SkippedBoard[] = []
  for (;;) {
    const nodes = nodesToDelete(candidates, boardIds, now)
    const skipped = boardsStillReferenced(
      candidates,
      boardIds,
      new Set(nodes.map((node) => node.id)),
    )
    if (skipped.length === 0) return { boardIds, nodes, skippedBoards }
    for (const board of skipped) {
      boardIds.delete(board.id)
      skippedBoards.push(board)
    }
  }
}

function edgesToDelete(
  candidates: NetworkReapCandidates,
  boardIds: ReadonlySet<string>,
  nodeIds: ReadonlySet<string>,
  now: number,
): Edge[] {
  const reapable = new Set(reapableEdgeIds(candidates.trashedEdges, now))
  return uniqueById([
    ...candidates.trashedEdges.filter((edge) => reapable.has(edge.id)),
    ...candidates.boardEdges.filter((edge) => boardIds.has(edge.boardId)),
    // Defensive: deleting a node tombstones its edges at the same instant,
    // so these should already qualify — but never leave one dangling.
    ...candidates.touchingEdges.filter(
      (edge) => nodeIds.has(edge.fromNodeId) || nodeIds.has(edge.toNodeId),
    ),
  ])
}

function imageIdOf(node: Node): string | undefined {
  return node.nodeType === 'card' && node.cardType === 'image'
    ? node.imageId
    : undefined
}

/** Builds the ordered delete plan from the server's reap candidates, as of `now`. */
export function planNetworkReap(
  candidates: NetworkReapCandidates,
  now: number,
): NetworkReapPlan {
  const { boardIds, nodes, skippedBoards } = settleBoards(candidates, now)
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges = edgesToDelete(candidates, boardIds, nodeIds, now)
  return {
    edgeIds: edges.map((edge) => edge.id),
    nodes: nodes.map((node) => ({
      id: node.id,
      edgeIds: edges
        .filter(
          (edge) => edge.fromNodeId === node.id || edge.toNodeId === node.id,
        )
        .map((edge) => edge.id),
      imageId: imageIdOf(node),
    })),
    boards: [...boardIds].map((boardId) => ({
      id: boardId,
      nodeIds: nodes
        .filter(
          (node) =>
            node.boardId === boardId || referencedBoardId(node) === boardId,
        )
        .map((node) => node.id),
      edgeIds: edges
        .filter((edge) => edge.boardId === boardId)
        .map((edge) => edge.id),
    })),
    skippedBoards,
  }
}

/** The distinct images referenced by the planned nodes that were actually deleted — the only images this pass considers (no full `GET /images` scan). */
export function imageCandidateIds(
  plan: NetworkReapPlan,
  deletedNodeIds: ReadonlySet<string>,
): string[] {
  return [
    ...new Set(
      plan.nodes
        .filter((node) => deletedNodeIds.has(node.id))
        .flatMap((node) => (node.imageId === undefined ? [] : [node.imageId])),
    ),
  ]
}

/** `imageIds` that no node in `referencingNodes` (any status) still points at — the only ones safe to delete. */
export function unreferencedImageIds(
  imageIds: readonly string[],
  referencingNodes: readonly Node[],
): string[] {
  const referenced = new Set(
    referencingNodes.flatMap((n) => imageIdOf(n) ?? []),
  )
  return imageIds.filter((id) => !referenced.has(id))
}
