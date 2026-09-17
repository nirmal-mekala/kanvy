// Zod schema for a `boards` collection entry (schema v3) — metadata only,
// per ctx/notes/260917-multiboard-support-design.md §2. Content (nodes/
// edges) lives in the shared, `boardId`-scoped `nodes`/`edges` arrays
// (schema/node.ts, schema/edge.ts), never here.

import { z } from 'zod'

export const BoardIdSchema = z.string()
// fallow-ignore-next-line unused-type
export type BoardId = z.infer<typeof BoardIdSchema>

/** Reserved id for the always-present, non-deletable home board (design doc §2). */
export const ROOT_BOARD_ID = 'root'

export const BoardMetaSchema = z
  .object({
    id: BoardIdSchema,
    title: z.string(),
    status: z.enum(['active', 'trashed']),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict()
// fallow-ignore-next-line unused-type
export type BoardMeta = z.infer<typeof BoardMetaSchema>
