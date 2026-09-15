// Zod schema for the v0 edge shape, per
// ctx/notes/260915-prototype-migration-phase2-schema.md §2.

import { z } from 'zod'
import { NodeIdSchema, SideSchema } from './node'

// Used internally to build EdgeSchema; exported for a later stage
// (components/edge/, Stage 6/7 direction-toggle UI) to import directly.
// fallow-ignore-next-line unused-export
export const EdgeDirectionSchema = z.enum(['none', 'forward', 'backward'])
// fallow-ignore-next-line unused-type
export type EdgeDirection = z.infer<typeof EdgeDirectionSchema>

export const EdgeSchema = z.object({
  id: z.string(),
  fromNodeId: NodeIdSchema,
  fromSide: SideSchema,
  toNodeId: NodeIdSchema,
  toSide: SideSchema,
  direction: EdgeDirectionSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Edge = z.infer<typeof EdgeSchema>
