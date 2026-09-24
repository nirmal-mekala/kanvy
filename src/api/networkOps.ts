// Maps a gesture's `pending.ops` (state/ops.ts) onto real per-entity REST
// calls (network mode design doc §5's table) — the network-mode half of
// `saveBoard`'s mode branch (see boardApi.ts's `saveBoardOverNetwork`).
// Local mode's own `saveBoard` internals (whole-document `writeBoard`) are
// completely untouched by this module.
//
// Id handling: this app's own client-generated (nanoid) ids are never sent
// as the id to create with — a REST backend (confirmed against json-server
// v1: `Service#create` unconditionally does `{ ...data, id: randomId() }`)
// is free to assign its own, and this module treats whatever comes back as
// that entity's canonical id from then on, via api/networkIdRemap.ts's
// translation table. Local app state (currentBoardAtom, selection, undo,
// …) never learns or cares about the server's id — every op reaching this
// module resolves its own target id, and any cross-entity references it
// carries (a node's `imageId`/`boardRef`, an edge's `fromNodeId`/
// `toNodeId`), through that same table before it goes over the wire.

import { ensureDataUriUnderBytes } from '../cards/imageFile'
import type { NetworkConfig } from '../state/atoms/networkSettings'
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

/** One table per network-mode session — see module comment and networkIdRemap.ts. Reset whenever network mode is (re-)entered (state/networkBoardLoader.ts). */
let idRemapTable: IdRemapTable = createIdRemapTable()

/** Exported for tests and for state/networkBoardLoader.ts's mode-switch reset — never call this mid-session, it would strand any op still resolving an id from before the reset. */
export function resetIdRemapTable(): void {
  idRemapTable = createIdRemapTable()
}

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
async function applyOp(
  config: NetworkConfig,
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
    const createdId = created.id
    if (typeof createdId === 'string') {
      recordRemap(idRemapTable, op.entity, originalId, createdId)
    }
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
    await applyImageOp(config, op, fetchImpl)
  }
  // 'reorder' / 'replace-board': no mapping — see doc comment above.
}

async function applyImageOp(
  config: NetworkConfig,
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
  const createdId = created.id
  if (typeof createdId === 'string') {
    recordRemap(idRemapTable, 'image', op.id, createdId)
  }
}

/**
 * Applies a whole gesture's ops to the network backend, sequentially (so a
 * later op's failure doesn't race an earlier one still in flight against
 * the same collection, and so each create's id is resolved and recorded
 * before any later-in-this-batch op that might reference it — see the
 * module comment) — one TanStack Query mutation per gesture (design doc
 * §5), even though it's several real HTTP requests underneath.
 */
export async function applyOpsToNetwork(
  config: NetworkConfig,
  ops: readonly Op[],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  for (const op of ops) {
    await applyOp(config, op, fetchImpl)
  }
}
