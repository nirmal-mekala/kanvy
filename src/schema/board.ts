// Zod schema for the top-level v0 Board document, per
// ctx/notes/260915-prototype-migration-phase2-schema.md §2. `images` is
// declared last so a schema-shaped object literal built from this order
// naturally serializes with `images` as the last top-level key (spec
// §2.8) — see src/state/persistence/serialize.ts for the actual
// key-ordering guarantee, which does not rely on object key order alone.

import { z } from 'zod'
import { BoardMetaSchema } from './boardMeta'
import { EdgeSchema } from './edge'
import { NodeSchema } from './node'

/**
 * Bumped whenever the persisted Board shape changes incompatibly. v2 ("v0.1"
 * in spec/doc prose — see ctx/notes/260915-kanvy-spec.md §2.3) drops the
 * formal `parentId` ownership field entirely; container membership is
 * purely spatial again, re-derived from x/y/w/h at drag time
 * (containers/containment.ts) rather than stored. v3 adds multiboard
 * support (ctx/notes/260917-multiboard-support-design.md §2): a `boards`
 * metadata collection, plus a `boardId` FK on every node/edge — `nodes`/
 * `edges` are now shared flat arrays across all boards, not one board's
 * worth of content. v4 adds tombstoning + explicit ordering to nodes/edges
 * (ctx/notes/260921-action-based-undo-and-tombstoning.md): `status` on
 * both, `index` on nodes only — see schema/node.ts and schema/edge.ts.
 */
export const SCHEMA_VERSION = 4

export const BoardSchema = z.object({
  version: z.number(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  boards: z.array(BoardMetaSchema),
  images: z.record(z.string(), z.string()),
})
export type Board = z.infer<typeof BoardSchema>
