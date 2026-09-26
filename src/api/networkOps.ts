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
import type { EntityKind, ImageOp, Op } from '../state/ops'
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

/** `value` without its own `id` field — never sent on create (see module comment); the server assigns one and this module learns it from the response instead. */
function withoutId(value: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, ...rest } = value
  return rest
}

/**
 * Applies one op to the REST backend. `ReorderOp`/`ReplaceBoardOp` have no
 * REST mapping (design doc §5/§10 — the former is unreachable from the UI
 * today, the latter's only source, JSON import, is hidden in network mode)
 * and are silently skipped here rather than treated as an error, matching
 * the design doc's explicit call to flag-not-build for both.
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

async function applyOp(
  config: NetworkConfig,
  idRemapTable: IdRemapTable,
  op: Op,
  fetchImpl: typeof fetch,
): Promise<void> {
  if (op.kind === 'create') {
    const collection = COLLECTION_BY_ENTITY[op.entity]
    const value = resolveValueReferences(
      idRemapTable,
      op.value as unknown as Record<string, unknown>,
    )
    const created = await createEntity<Record<string, unknown>>(
      config,
      collection,
      withoutId(value),
      fetchImpl,
    )
    const originalId = (op.value as { id: string }).id
    recordAndReconcile(idRemapTable, op.entity, originalId, created.id)
    return
  }
  if (op.kind === 'update') {
    const id = resolveId(idRemapTable, op.entity, op.id)
    const after = resolveValueReferences(idRemapTable, op.after)
    await patchEntity(
      config,
      COLLECTION_BY_ENTITY[op.entity],
      id,
      after,
      fetchImpl,
    )
    return
  }
  if (op.kind === 'image') {
    await applyImageOp(config, idRemapTable, op, fetchImpl)
  }
  // 'reorder' / 'replace-board': no mapping — see doc comment above.
}

async function applyImageOp(
  config: NetworkConfig,
  idRemapTable: IdRemapTable,
  op: ImageOp,
  fetchImpl: typeof fetch,
): Promise<void> {
  const id = resolveId(idRemapTable, 'image', op.id)
  if (op.after === undefined) {
    await deleteEntity(config, 'images', id, fetchImpl)
    return
  }
  const dataUri = await ensureDataUriUnderBytes(
    op.after,
    JSON_SERVER_MAX_IMAGE_BYTES,
  )
  if (op.before !== undefined) {
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
 * fresh, empty one every time, never shared across gestures.
 */
export async function applyOpsToNetwork(
  config: NetworkConfig,
  ops: readonly Op[],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const idRemapTable = createIdRemapTable()
  for (const op of ops) {
    await applyOp(config, idRemapTable, op, fetchImpl)
  }
}
