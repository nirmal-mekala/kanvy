// Maps a gesture's `pending.ops` (state/ops.ts) onto real per-entity REST
// calls (network mode design doc §5's table) — the network-mode half of
// `saveBoard`'s mode branch (see boardApi.ts's `saveBoardOverNetwork`).
// Local mode's own `saveBoard` internals (whole-document `writeBoard`) are
// completely untouched by this module.

import type { NetworkConfig } from '../state/atoms/networkSettings'
import type { EntityKind, Op } from '../state/ops'
import { createEntity, deleteEntity, patchEntity } from './restClient'

const COLLECTION_BY_ENTITY: Record<EntityKind, string> = {
  node: 'nodes',
  edge: 'edges',
  board: 'boards',
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
    await createEntity(
      config,
      COLLECTION_BY_ENTITY[op.entity],
      op.value,
      fetchImpl,
    )
    return
  }
  if (op.kind === 'update') {
    await patchEntity(
      config,
      COLLECTION_BY_ENTITY[op.entity],
      op.id,
      op.after,
      fetchImpl,
    )
    return
  }
  if (op.kind === 'image') {
    if (op.after === undefined) {
      await deleteEntity(config, 'images', op.id, fetchImpl)
    } else if (op.before === undefined) {
      await createEntity(
        config,
        'images',
        { id: op.id, dataUri: op.after },
        fetchImpl,
      )
    } else {
      await patchEntity(
        config,
        'images',
        op.id,
        { dataUri: op.after },
        fetchImpl,
      )
    }
  }
  // 'reorder' / 'replace-board': no mapping — see doc comment above.
}

/**
 * Applies a whole gesture's ops to the network backend, sequentially (so a
 * later op's failure doesn't race an earlier one still in flight against
 * the same collection) — one TanStack Query mutation per gesture (design
 * doc §5), even though it's several real HTTP requests underneath.
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
