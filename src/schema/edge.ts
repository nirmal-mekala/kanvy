// Zod schema for the v0 edge shape, per
// ctx/notes/260915-prototype-migration-phase2-schema.md §2.

import { z } from 'zod'
import { BoardIdSchema } from './boardMeta'
import { NodeIdSchema, SideSchema } from './node'

// Used internally to build EdgeSchema; exported for a later stage
// (components/edge/, Stage 6/7 direction-toggle UI) to import directly.
// fallow-ignore-next-line unused-export
export const EdgeDirectionSchema = z.enum(['none', 'forward', 'backward'])
// fallow-ignore-next-line unused-type
export type EdgeDirection = z.infer<typeof EdgeDirectionSchema>

export const EdgeSchema = z.object({
  id: z.string(),
  // FK into `boards` (schema/boardMeta.ts) — an edge only ever connects
  // two nodes on the same board, so it carries the same `boardId` its
  // endpoints do (schema v3).
  boardId: BoardIdSchema,
  fromNodeId: NodeIdSchema,
  fromSide: SideSchema,
  toNodeId: NodeIdSchema,
  toSide: SideSchema,
  direction: EdgeDirectionSchema,
  // Tombstone field, schema v4 — same meaning as `Node.status` (see
  // schema/node.ts). No `index`: edges have no z-order/paint-order concept.
  status: z.enum(['active', 'trashed']),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Edge = z.infer<typeof EdgeSchema>
