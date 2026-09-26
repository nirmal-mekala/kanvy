// Client-generated ids (nanoid) are this app's canonical identity
// everywhere *except* against the REST backend itself — json-server (and,
// per its own docs, REST backends generally) assigns its own id on every
// `POST`, discarding whatever the client sent (confirmed directly against
// json-server v1's `Service#create`: `{ ...data, id: randomId() }`, always
// overwriting). Rather than fight that by trying to force our id through,
// network mode defers to the server: the response's `id` becomes that
// entity's canonical id for every REST call from then on.
//
// This table is deliberately *batch-scoped*, not session-scoped
// (ctx/notes/260925-network-id-reconciliation.md) — api/networkOps.ts
// creates a fresh one per `applyOpsToNetwork` call, used only to resolve
// references among ops created together in the same gesture (e.g. a new
// board's board-card node, sent before the board's own create has
// resolved). Once a create's real id is known, api/networkOps.ts
// immediately reconciles it into canonical app state (state/
// networkReconcile.ts) — the live board, undo history, current-board
// tracking, the route, and selection — so nothing *outside* one in-flight
// batch ever needs to resolve an id through a table like this one again.

import type { EntityKind } from '../state/ops'

export type RemapKind = EntityKind | 'image'

export type IdRemapTable = Record<RemapKind, Map<string, string>>

export function createIdRemapTable(): IdRemapTable {
  return {
    node: new Map(),
    edge: new Map(),
    board: new Map(),
    image: new Map(),
  }
}

/** Records that `oldId` (this app's own id) is now stored server-side as `newId`. A no-op when they're already equal — most backends' own generated ids won't collide with this, but nothing here assumes that. */
export function recordRemap(
  table: IdRemapTable,
  kind: RemapKind,
  oldId: string,
  newId: string,
): void {
  if (oldId === newId) return
  table[kind].set(oldId, newId)
}

/** Resolves `id` through any recorded remap for `kind`, or returns it unchanged if none was ever recorded (the common case — most backends' generated ids are still discovered fresh each time, but once resolved, every later reference to the same entity resolves the same way). */
export function resolveId(
  table: IdRemapTable,
  kind: RemapKind,
  id: string,
): string {
  return table[kind].get(id) ?? id
}

/**
 * Rewrites the cross-entity id references inside a node/edge value object
 * (a `CreateOp.value` or an `UpdateOp.after`/`before`) using whatever's
 * already been resolved in `table` — a node's `imageId`/`boardRef`/
 * `boardId`, or an edge's `fromNodeId`/`toNodeId`/`boardId`. Returns
 * `value` unchanged (same reference) when nothing needed rewriting. Every
 * other field passes through untouched; this never touches the value's own
 * `id`, since a create's `id` field is stripped before sending (see
 * networkOps.ts) and an update's target id is resolved separately, by the
 * caller, against the op's own entity kind.
 */
export function resolveValueReferences(
  table: IdRemapTable,
  value: Record<string, unknown>,
): Record<string, unknown> {
  let result = value
  if (typeof value.imageId === 'string') {
    const resolved = resolveId(table, 'image', value.imageId)
    if (resolved !== value.imageId) result = { ...result, imageId: resolved }
  }
  if (typeof value.boardRef === 'string') {
    const resolved = resolveId(table, 'board', value.boardRef)
    if (resolved !== value.boardRef) result = { ...result, boardRef: resolved }
  }
  if (typeof value.boardId === 'string') {
    const resolved = resolveId(table, 'board', value.boardId)
    if (resolved !== value.boardId) result = { ...result, boardId: resolved }
  }
  if (typeof value.fromNodeId === 'string') {
    const resolved = resolveId(table, 'node', value.fromNodeId)
    if (resolved !== value.fromNodeId) {
      result = { ...result, fromNodeId: resolved }
    }
  }
  if (typeof value.toNodeId === 'string') {
    const resolved = resolveId(table, 'node', value.toNodeId)
    if (resolved !== value.toNodeId) result = { ...result, toNodeId: resolved }
  }
  return result
}
