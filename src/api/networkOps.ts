// Maps a gesture's `pending.ops` (state/ops.ts) onto real per-entity REST
// calls (network mode design doc §5's table) — the network-mode half of
// `saveBoard`'s mode branch (see boardApi.ts's `saveBoardOverNetwork`).
// Local mode's own `saveBoard` internals (whole-document `writeBoard`) are
// completely untouched by this module.
//
// Id handling (ctx/notes/260925-network-id-reconciliation.md): this app's
// own client-generated (nanoid) ids are never sent as the id to create
// with — a REST backend (confirmed against json-server v1: `Service#create`
// unconditionally does `{ ...data, id: randomId() }`) is free to assign
// its own. Within one `applyOpsToNetwork` call, a batch-scoped table
// (api/networkIdRemap.ts) resolves references among ops created together
// in the same gesture (e.g. a new board's board-card node, sent before the
// board's own create has resolved). The instant any create's real id is
// known, it's also reconciled immediately into canonical app state
// (state/networkReconcile.ts) — so a *later*, separate gesture's ops,
// built from that already-reconciled state, never need any id resolution
// at all by the time they reach this module.

import { ensureDataUriUnderBytes } from '../cards/imageFile'
import type { NetworkConfig } from '../state/atoms/networkSettings'
import { reconcileNetworkEntityIdAtom } from '../state/networkReconcile'
import type { CreateOp, EntityKind, ImageOp, Op, OpReplay } from '../state/ops'
import {
  createIdRemapTable,
  type IdRemapTable,
  recordRemap,
  resolveId,
  resolveValueReferences,
} from './networkIdRemap'
import { createEntity, deleteEntity, patchEntity } from './restClient'

const COLLECTION_BY_ENTITY: Record<EntityKind, string> = {
  node: 'nodes',
  edge: 'edges',
  board: 'boards',
}

/**
 * json-server's default body-size limit is ~100KB — a pasted/dropped image
 * already downsized to spec §2.6's 1200px-long-edge cap can still exceed
 * that for a busy/high-detail PNG (the reported bug: pasting an image in
 * network mode failed the `POST /images`). Targets comfortably under the
 * limit rather than right up against it, to leave headroom for the JSON
 * envelope (`{"id":"...","dataUri":"..."}`) around the base64 payload
 * itself.
 */
const JSON_SERVER_MAX_IMAGE_BYTES = 90_000

/**
 * A PATCH body for an update op's patch: every field the patch *removes*
 * (`undefined` — see `applyPatch` in state/ops.ts) is sent as an explicit
 * `null`, so the server blanks it out. `JSON.stringify` would otherwise
 * drop the key entirely, leaving the server's old value in place (schema
 * v7, ctx/notes/261008-flat-link-fields.md).
 */
function patchBody(patch: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [key, value ?? null]),
  )
}

/** `value` without its own `id` field — never sent on create (see module comment); the server assigns one and this module learns it from the response instead. */
function withoutId(value: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, ...rest } = value
  return rest
}

/**
 * Applies one op to the REST backend. `ReplaceBoardOp` has no REST mapping
 * (design doc §10 — its only source, JSON import, is hidden in network
 * mode) and is silently skipped here rather than treated as an error,
 * matching the design doc's explicit call to flag-not-build for it.
 */
/** `originalId`/`createdId` differing means the server assigned its own id (the common case, see module comment) — recorded in the batch-scoped `idRemapTable` for the rest of this gesture, and reconciled immediately into canonical app state so no *later* gesture ever needs to resolve it. A no-op when they're already equal. */
function recordAndReconcile(
  idRemapTable: IdRemapTable,
  kind: EntityKind | 'image',
  originalId: string,
  createdId: unknown,
): void {
  if (typeof createdId !== 'string' || createdId === originalId) return
  recordRemap(idRemapTable, kind, originalId, createdId)
  reconcileNetworkEntityIdAtom(kind, originalId, createdId)
}

/**
 * A `create` replayed by undo/redo (ctx/notes/261008-network-undo-redo.md).
 * The entity already exists server-side from its original POST, so undo
 * tombstones it (`status: 'trashed'`) and redo reactivates it (`'active'`)
 * — a plain status PATCH either way, never a DELETE or a second POST (a
 * second POST would mint a new server id). Every entity kind with a
 * `create` op (node, edge, board) has a `status` field.
 *
 * `updatedAt` travels with the status: undo stamps the tombstone time (the
 * network reaper ages trashed entities by `updatedAt` —
 * ctx/notes/261009-network-reaper-and-image-lifecycle.md), and redo
 * restores the create's original `updatedAt`, matching local redo, which
 * re-appends `op.value` unchanged.
 */
async function applyReplayedCreate(
  config: NetworkConfig,
  idRemapTable: IdRemapTable,
  op: CreateOp,
  replay: 'undo' | 'redo',
  fetchImpl: typeof fetch,
): Promise<void> {
  const id = resolveId(idRemapTable, op.entity, op.value.id)
  await patchEntity(
    config,
    COLLECTION_BY_ENTITY[op.entity],
    id,
    replay === 'undo'
      ? { status: 'trashed', updatedAt: new Date().toISOString() }
      : { status: 'active', updatedAt: op.value.updatedAt },
    fetchImpl,
  )
}

async function applyCreate(
  config: NetworkConfig,
  idRemapTable: IdRemapTable,
  op: CreateOp,
  fetchImpl: typeof fetch,
): Promise<void> {
  const value = resolveValueReferences(
    idRemapTable,
    op.value as unknown as Record<string, unknown>,
  )
  const created = await createEntity<Record<string, unknown>>(
    config,
    COLLECTION_BY_ENTITY[op.entity],
    withoutId(value),
    fetchImpl,
  )
  recordAndReconcile(idRemapTable, op.entity, op.value.id, created.id)
}

async function applyOp(
  config: NetworkConfig,
  idRemapTable: IdRemapTable,
  op: Op,
  replay: OpReplay,
  fetchImpl: typeof fetch,
): Promise<void> {
  if (op.kind === 'create') {
    if (replay === 'do') {
      await applyCreate(config, idRemapTable, op, fetchImpl)
    } else {
      await applyReplayedCreate(config, idRemapTable, op, replay, fetchImpl)
    }
    return
  }
  if (op.kind === 'update') {
    // Undo restores the op's `before`; do/redo apply its `after`.
    const patch = replay === 'undo' ? op.before : op.after
    const id = resolveId(idRemapTable, op.entity, op.id)
    await patchEntity(
      config,
      COLLECTION_BY_ENTITY[op.entity],
      id,
      patchBody(resolveValueReferences(idRemapTable, patch)),
      fetchImpl,
    )
    return
  }
  if (op.kind === 'image') {
    await applyImageOp(config, idRemapTable, op, replay, fetchImpl)
  }
  // 'replace-board': no mapping — see doc comment above.
}

/**
 * An image op, in either direction. `from`/`to` are the image's server-side
 * value before/after this replay (`undefined` = no such image): no target
 * → DELETE, no source → POST, otherwise PATCH.
 *
 * Replaying an image *create* is the exception: neither undo nor redo
 * sends anything. The row stays on the server through undo, because the
 * now-trashed node still references it (a `RESTRICT` foreign key would
 * reject the DELETE). So redo has nothing to re-create, and the row's
 * server id was already reconciled into app state and history by the
 * original POST. The network reaper deletes the image once its last
 * referencing node is reaped
 * (ctx/notes/261009-network-reaper-and-image-lifecycle.md). Locally, undo
 * still drops the entry and redo re-adds it (state/ops.ts).
 */
async function applyImageOp(
  config: NetworkConfig,
  idRemapTable: IdRemapTable,
  op: ImageOp,
  replay: OpReplay,
  fetchImpl: typeof fetch,
): Promise<void> {
  if (replay !== 'do' && op.before === undefined) return
  const [from, to] =
    replay === 'undo' ? [op.after, op.before] : [op.before, op.after]
  const id = resolveId(idRemapTable, 'image', op.id)
  if (to === undefined) {
    await deleteEntity(config, 'images', id, fetchImpl)
    return
  }
  const dataUri = await ensureDataUriUnderBytes(to, JSON_SERVER_MAX_IMAGE_BYTES)
  if (from !== undefined) {
    await patchEntity(config, 'images', id, { dataUri }, fetchImpl)
    return
  }
  const created = await createEntity<Record<string, unknown>>(
    config,
    'images',
    { dataUri },
    fetchImpl,
  )
  recordAndReconcile(idRemapTable, 'image', op.id, created.id)
}

/**
 * Applies a whole gesture's ops to the network backend, sequentially (so a
 * later op's failure doesn't race an earlier one still in flight against
 * the same collection, and so each create's id is resolved and recorded
 * before any later-in-this-batch op that might reference it — see the
 * module comment) — one TanStack Query mutation per gesture (design doc
 * §5), even though it's several real HTTP requests underneath. The
 * id-remap table is scoped to this one call (see networkIdRemap.ts) — a
 * fresh, empty one every time, never shared across gestures. `replay`
 * says whether this is the gesture itself, its undo, or its redo
 * (state/ops.ts's `OpReplay`); an undo applies the ops in reverse order,
 * the same as `applyOps(…, 'before')` does locally.
 */
export async function applyOpsToNetwork(
  config: NetworkConfig,
  ops: readonly Op[],
  replay: OpReplay = 'do',
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const idRemapTable = createIdRemapTable()
  const ordered = replay === 'undo' ? [...ops].reverse() : ops
  for (const op of ordered) {
    await applyOp(config, idRemapTable, op, replay, fetchImpl)
  }
}
