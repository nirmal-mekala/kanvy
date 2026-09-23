// Tombstoned-board reaper (multiboard support design doc §5/§7): a
// deleted board's content is never actually removed at delete time — only
// tombstoned (`boards[id].status = 'trashed'`), so undo/redo on the
// delete stays O(1) regardless of how much content the board held. This
// module is what eventually frees that content.
//
// Trigger: an on-load sweep (developer decision, this implementation's
// checkpoint). The literal "wait for the delete's undo window to age
// out" reading doesn't survive contact with reality, though: undo
// history is in-memory only, never persisted, so at load time the
// in-session undo window is *always* empty — there is no reachable
// history yet. A literal on-load-sweep-respecting-the-undo-window would
// therefore need to permanently purge a trashed board on the very next
// reload after deleting it, including an accidental refresh seconds
// after the delete, before the user has any chance to notice and undo.
// That's a real, surprising data-loss risk this app doesn't have
// anywhere else. Instead, a trashed board is only reaped once its
// tombstone (`updatedAt`, the timestamp of the status flip) is older
// than `REAP_AGE_MS` — generous enough that an accidental delete stays
// recoverable (in principle, once a restore UI exists) well past a
// stray reload, while still eventually reclaiming storage.

import type { Board } from '../schema/board'
import type { BoardMeta } from '../schema/boardMeta'
import type { Edge } from '../schema/edge'
import type { Node } from '../schema/node'
import { pruneOrphanedImages } from './pruneOrphanedImages'

/** 24 hours — generous enough that an accidental delete survives a stray reload, small enough that storage doesn't grow unbounded from boards nobody will ever recover. */
export const REAP_AGE_MS = 24 * 60 * 60 * 1000

// Node/edge tombstones (schema v4, ctx/notes/260921-action-based-undo-and-
// tombstoning.md Q6) get their own named constant rather than reusing
// `REAP_AGE_MS` directly — starts at the same value as boards for now, but
// individual card/edge delete happens far more often than whole-board
// delete, so this is very likely to need its own, shorter tuning later
// (flagged, not resolved, by the design doc).
export const NODE_REAP_AGE_MS = REAP_AGE_MS

/** Every trashed board whose tombstone is older than `REAP_AGE_MS` as of `now`. */
export function reapableBoardIds(
  boards: readonly BoardMeta[],
  now: number,
): string[] {
  return boards
    .filter(
      (board) =>
        board.status === 'trashed' &&
        now - new Date(board.updatedAt).getTime() > REAP_AGE_MS,
    )
    .map((board) => board.id)
}

/** Every trashed node whose tombstone is older than `NODE_REAP_AGE_MS` as of `now`. */
export function reapableNodeIds(nodes: readonly Node[], now: number): string[] {
  return nodes
    .filter(
      (node) =>
        node.status === 'trashed' &&
        now - new Date(node.updatedAt).getTime() > NODE_REAP_AGE_MS,
    )
    .map((node) => node.id)
}

/** Every trashed edge whose tombstone is older than `NODE_REAP_AGE_MS` as of `now`. */
export function reapableEdgeIds(edges: readonly Edge[], now: number): string[] {
  return edges
    .filter(
      (edge) =>
        edge.status === 'trashed' &&
        now - new Date(edge.updatedAt).getTime() > NODE_REAP_AGE_MS,
    )
    .map((edge) => edge.id)
}

/** Permanently removes `boardIds` and every node/edge/image that belonged only to them. A no-op (returns `board` unchanged) if `boardIds` is empty. */
export function reapBoards(board: Board, boardIds: readonly string[]): Board {
  if (boardIds.length === 0) return board
  const idSet = new Set(boardIds)
  const nodes = board.nodes.filter((node) => !idSet.has(node.boardId))
  return {
    ...board,
    boards: board.boards.filter((meta) => !idSet.has(meta.id)),
    nodes,
    edges: board.edges.filter((edge) => !idSet.has(edge.boardId)),
    images: pruneOrphanedImages(nodes, board.images),
  }
}

/**
 * The single on-load reap entry point (schema v4) — supersedes calling
 * `reapBoards` alone. Sweeps trashed boards (and everything that belonged
 * to them), then trashed nodes/edges directly, then prunes orphaned images
 * once at the end against whatever's left — the "deferred sweep" image
 * lifecycle (Q3): an image referenced only by a still-trashed-but-not-yet-
 * reaped node stays in `images` until its node is actually reaped, exactly
 * like a board's content does today. A no-op (returns `board` unchanged)
 * if nothing is reapable.
 */
export function reapEntities(board: Board, now: number): Board {
  const boardReaped = reapBoards(board, reapableBoardIds(board.boards, now))
  const nodeIds = new Set(reapableNodeIds(boardReaped.nodes, now))
  const edgeIds = new Set(reapableEdgeIds(boardReaped.edges, now))
  if (nodeIds.size === 0 && edgeIds.size === 0) return boardReaped
  const nodes = boardReaped.nodes.filter((node) => !nodeIds.has(node.id))
  const edges = boardReaped.edges.filter((edge) => !edgeIds.has(edge.id))
  return {
    ...boardReaped,
    nodes,
    edges,
    images: pruneOrphanedImages(nodes, boardReaped.images),
  }
}
