// Rewrites every occurrence of a since-superseded id (network mode: the
// locally-minted id a create op used optimistically, now that the real
// backend-assigned id is known — see api/networkOps.ts) into canonical app
// state, in place, instead of resolving ids through a side table on every
// later read (see ctx/notes/260925-network-id-reconciliation.md for the
// design this replaces and why).
//
// `RemapKind` mirrors api/networkOps.ts's `EntityKind` plus `'image'`,
// since `images` isn't a node/edge/board entity but still has its own id
// and its own cross-reference field (a node's `imageId`).

import type { Board } from '../schema/board'
import type { Edge } from '../schema/edge'
import type { Node } from '../schema/node'
import type { HistoryState } from './history/reducer'
import type { AttributedOps, CreateOp, Op, UpdateOp } from './ops'

export type RemapKind = 'node' | 'edge' | 'board' | 'image'

function reconcileNodeBoardFields(
  node: Node,
  oldId: string,
  newId: string,
): Node {
  let result = node
  if (result.boardId === oldId) result = { ...result, boardId: newId }
  if (
    result.type === 'card' &&
    result.kind === 'board' &&
    result.boardRef === oldId
  ) {
    result = { ...result, boardRef: newId }
  }
  return result
}

function reconcileNode(
  node: Node,
  kind: RemapKind,
  oldId: string,
  newId: string,
): Node {
  if (kind === 'board') return reconcileNodeBoardFields(node, oldId, newId)
  if (
    kind === 'image' &&
    node.type === 'card' &&
    node.kind === 'image' &&
    node.imageId === oldId
  ) {
    return { ...node, imageId: newId }
  }
  if (kind === 'node' && node.id === oldId) return { ...node, id: newId }
  return node
}

function reconcileEdge(
  edge: Edge,
  kind: RemapKind,
  oldId: string,
  newId: string,
): Edge {
  let result = edge
  if (kind === 'board' && result.boardId === oldId) {
    result = { ...result, boardId: newId }
  }
  if (kind === 'node' && result.fromNodeId === oldId) {
    result = { ...result, fromNodeId: newId }
  }
  if (kind === 'node' && result.toNodeId === oldId) {
    result = { ...result, toNodeId: newId }
  }
  if (kind === 'edge' && result.id === oldId) {
    result = { ...result, id: newId }
  }
  return result
}

/**
 * Rewrites `oldId` to `newId` everywhere it appears in `board`: the
 * entity's own id in its collection, plus every other entity's field that
 * references it. Returns the same `board` reference when nothing changed.
 */
export function reconcileEntityId(
  board: Board,
  kind: RemapKind,
  oldId: string,
  newId: string,
): Board {
  if (oldId === newId) return board
  let result = board

  const nodes = result.nodes.map((node) =>
    reconcileNode(node, kind, oldId, newId),
  )
  if (nodes.some((node, i) => node !== result.nodes[i])) {
    result = { ...result, nodes }
  }

  const edges = result.edges.map((edge) =>
    reconcileEdge(edge, kind, oldId, newId),
  )
  if (edges.some((edge, i) => edge !== result.edges[i])) {
    result = { ...result, edges }
  }

  if (kind === 'board') {
    const boards = result.boards.map((meta) =>
      meta.id === oldId ? { ...meta, id: newId } : meta,
    )
    if (boards.some((meta, i) => meta !== result.boards[i])) {
      result = { ...result, boards }
    }
  }

  if (kind === 'image') {
    const images = result.images.map((entry) =>
      entry.id === oldId ? { ...entry, id: newId } : entry,
    )
    if (images.some((entry, i) => entry !== result.images[i])) {
      result = { ...result, images }
    }
  }

  return result
}

function reconcileCreateOp(
  op: CreateOp,
  kind: RemapKind,
  oldId: string,
  newId: string,
): Op {
  if (op.entity === 'node') {
    const value = reconcileNode(op.value as Node, kind, oldId, newId)
    return value === op.value ? op : { ...op, value }
  }
  if (op.entity === 'edge') {
    const value = reconcileEdge(op.value as Edge, kind, oldId, newId)
    return value === op.value ? op : { ...op, value }
  }
  // op.entity === 'board'
  if (kind !== 'board' || op.value.id !== oldId) return op
  return { ...op, value: { ...op.value, id: newId } }
}

function reconcilePatch(
  patch: Record<string, unknown>,
  kind: RemapKind,
  oldId: string,
  newId: string,
): Record<string, unknown> {
  const fields =
    kind === 'board'
      ? (['boardId', 'boardRef'] as const)
      : kind === 'image'
        ? (['imageId'] as const)
        : kind === 'node'
          ? (['fromNodeId', 'toNodeId'] as const)
          : ([] as const)
  let result = patch
  for (const field of fields) {
    if (result[field] === oldId) result = { ...result, [field]: newId }
  }
  return result
}

function reconcileUpdateOp(
  op: UpdateOp,
  kind: RemapKind,
  oldId: string,
  newId: string,
): Op {
  let result = op
  if (kind === (op.entity as string) && op.id === oldId) {
    result = { ...result, id: newId }
  }
  const before = reconcilePatch(result.before, kind, oldId, newId)
  const after = reconcilePatch(result.after, kind, oldId, newId)
  if (before !== result.before) result = { ...result, before }
  if (after !== result.after) result = { ...result, after }
  return result
}

function reconcileOp(
  op: Op,
  kind: RemapKind,
  oldId: string,
  newId: string,
): Op {
  if (op.kind === 'create') return reconcileCreateOp(op, kind, oldId, newId)
  if (op.kind === 'update') return reconcileUpdateOp(op, kind, oldId, newId)
  // 'image' ops key off their own `id` (the image's id) directly, and
  // carry no other entity's cross-reference field; 'reorder'/'replace-board'
  // aren't reachable from network-mode create paths (ops.ts) — left as-is.
  if (op.kind === 'image' && kind === 'image' && op.id === oldId) {
    return { ...op, id: newId }
  }
  return op
}

function reconcileAttributedOps(
  entry: AttributedOps,
  kind: RemapKind,
  oldId: string,
  newId: string,
): AttributedOps {
  const ops = entry.ops.map((op) => reconcileOp(op, kind, oldId, newId))
  const boardId =
    kind === 'board' && entry.boardId === oldId ? newId : entry.boardId
  if (boardId === entry.boardId && ops.every((op, i) => op === entry.ops[i])) {
    return entry
  }
  return { ops, boardId }
}

/**
 * Same rewrite as `reconcileEntityId`, applied across every history-stack
 * entry's stored ops — so undo/redo of anything created before its id was
 * confirmed keeps targeting a real, live entity afterward instead of an id
 * `currentBoardAtom` no longer has.
 */
export function reconcileHistoryIds(
  history: HistoryState<AttributedOps>,
  kind: RemapKind,
  oldId: string,
  newId: string,
): HistoryState<AttributedOps> {
  if (oldId === newId) return history
  const rewriteEntry = (entry: { state: AttributedOps }) => {
    const state = reconcileAttributedOps(entry.state, kind, oldId, newId)
    return state === entry.state ? entry : { ...entry, state }
  }
  const past = history.past.map(rewriteEntry)
  const present = rewriteEntry(history.present)
  const future = history.future.map(rewriteEntry)
  if (
    past.every((entry, i) => entry === history.past[i]) &&
    present === history.present &&
    future.every((entry, i) => entry === history.future[i])
  ) {
    return history
  }
  return { ...history, past, present, future }
}
