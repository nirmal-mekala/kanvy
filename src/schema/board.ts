// Zod schema for the top-level v0 Board document, per
// ctx/notes/260915-prototype-migration-phase2-schema.md §2. `images` is
// declared last so a schema-shaped object literal built from this order
// naturally serializes with `images` as the last top-level key (spec
// §2.8) — see src/state/persistence/serialize.ts for the actual
// key-ordering guarantee, which does not rely on object key order alone.

import { z } from 'zod'
import { EdgeSchema } from './edge'
import { NodeSchema } from './node'

/** Bumped whenever the persisted Board shape changes incompatibly. */
export const SCHEMA_VERSION = 1

export const BoardSchema = z.object({
  version: z.number(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  images: z.record(z.string(), z.string()),
})
export type Board = z.infer<typeof BoardSchema>
