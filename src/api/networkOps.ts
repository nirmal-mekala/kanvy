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
// its own. Every op's ids are resolved through an id-remap table
// (api/networkIdRemap.ts) right before it's sent. That covers references
// among ops created together in one gesture (e.g. a new board's board-card
// node). With the session-lived table api/boardApi.ts passes in, it also
// covers ops built under a client id while that entity's create was still
// in flight (ctx/notes/261029-edits-to-unconfirmed-creates.md). The instant
// any create's real id is known, it's also reconciled into canonical app
// state (state/networkReconcile.ts), so ops built after that already carry
// the server id.
//
// Retry-safe: a failed batch is re-sent whole (state/history/
// boardHistoryAtom.ts retries its save mutation), so every op here must be
// safe to apply twice. PATCHes are; a create the table has already recorded
// is skipped rather than POSTed again.

import { ensureDataUriUnderBytes } from '../cards/imageFile'
import type { NetworkConfig } from '../state/atoms/networkSettings'
import { reconcileNetworkEntityIdAtom } from '../state/networkReconcile'
import type { CreateOp, EntityKind, ImageOp, Op, OpReplay } from '../state/ops'
import { getDialect } from './dialects/registry'
import type { Collection, EntityCreate, EntityPatch } from './dialects/types'
import {
  createIdRemapTable,
  type IdRemapTable,
  isConfirmed,
  recordRemap,
  resolveId,
  resolveValueReferences,
} from './networkIdRemap'
import { createEntity, patchEntity } from './restClient'

type EntityCollection = Exclude<Collection, 'images'>

const COLLECTION_BY_ENTITY: Record<EntityKind, EntityCollection> = {
  node: 'nodes',
  edge: 'edges',
  board: 'boards',
}

// Ops carry their values/patches as `Record<string, unknown>` (state/
// ops.ts), but every one was built by a mutation atom from a typed entity,
// and `resolveValueReferences` only ever swaps id strings for id strings —
// so these two casts restate types the op already had, at the one place
// ops meet the typed REST boundary.
const asCreate = (value: Record<string, unknown>) =>
  value as unknown as EntityCreate<EntityCollection>
const asPatch = (patch: Record<string, unknown>) =>
  patch as EntityPatch<EntityCollection>

/** An image's data URI, shrunk to fit the connection's dialect's per-request limit (json-server's ~100KB body cap — the reported bug: pasting an image in network mode failed the `POST /images`), if it has one. */
function fitImageToDialect(
  config: NetworkConfig,
  dataUri: string,
): Promise<string> {
  const { maxImageBytes } = getDialect(config.dialectId).limits
  return maxImageBytes === null
    ? Promise.resolve(dataUri)
    : ensureDataUriUnderBytes(dataUri, maxImageBytes)
}

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
/** Records a successful create in `idRemapTable` (marking it confirmed, and resolving every op still to be sent that refers to it), and — when the server assigned its own id, the common case (see module comment) — reconciles that id into canonical app state. */
function recordAndReconcile(
  idRemapTable: IdRemapTable,
  kind: EntityKind | 'image',
  originalId: string,
  createdId: unknown,
): void {
  if (typeof createdId !== 'string') return
  recordRemap(idRemapTable, kind, originalId, createdId)
  if (createdId !== originalId) {
    reconcileNetworkEntityIdAtom(kind, originalId, createdId)
  }
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
  // Already created by an earlier attempt at this same batch.
  if (isConfirmed(idRemapTable, op.entity, op.value.id)) return
  const value = resolveValueReferences(
    idRemapTable,
    op.value as unknown as Record<string, unknown>,
  )
  const created = await createEntity(
    config,
    COLLECTION_BY_ENTITY[op.entity],
    asCreate(withoutId(value)),
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
      asPatch(patchBody(resolveValueReferences(idRemapTable, patch))),
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
 * value before/after this replay (`undefined` = no such image): no source
 * → POST, otherwise PATCH. No target sends nothing: an image row is only
 * ever deleted by the network reaper, after it has asked the server that
 * no node row of any status still references it — never from an op, which
 * only knows the client's partially loaded document (images are shared
 * across nodes and boards by copy/paste/duplicate). No mutation produces
 * such an op today.
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
  if (to === undefined) return
  if (from === undefined && isConfirmed(idRemapTable, 'image', op.id)) return
  const dataUri = await fitImageToDialect(config, to)
  if (from !== undefined) {
    await patchEntity(config, 'images', id, { dataUri }, fetchImpl)
    return
  }
  const created = await createEntity(config, 'images', { dataUri }, fetchImpl)
  recordAndReconcile(idRemapTable, 'image', op.id, created.id)
}

/**
 * Applies a whole gesture's ops to the network backend, sequentially (so a
 * later op's failure doesn't race an earlier one still in flight against
 * the same collection, and so each create's id is resolved and recorded
 * before any later-in-this-batch op that might reference it — see the
 * module comment) — one TanStack Query mutation per gesture (design doc
 * §5), even though it's several real HTTP requests underneath.
 * `idRemapTable` defaults to a fresh one, scoped to this one call; the app's
 * own saves pass a session-lived one instead (api/boardApi.ts — see the
 * module comment). `replay`
 * says whether this is the gesture itself, its undo, or its redo
 * (state/ops.ts's `OpReplay`); an undo applies the ops in reverse order,
 * the same as `applyOps(…, 'before')` does locally.
 */
export async function applyOpsToNetwork(
  config: NetworkConfig,
  ops: readonly Op[],
  replay: OpReplay = 'do',
  fetchImpl: typeof fetch = fetch,
  idRemapTable: IdRemapTable = createIdRemapTable(),
): Promise<void> {
  const ordered = replay === 'undo' ? [...ops].reverse() : ops
  for (const op of ordered) {
    await applyOp(config, idRemapTable, op, replay, fetchImpl)
  }
}
