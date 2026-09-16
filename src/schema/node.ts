// Zod schemas for the v0 node shape, per
// ctx/notes/260915-prototype-migration-phase2-schema.md §2. Zod is the
// source of truth for the data model (AGENTS.md Stack) — every TS type
// here is derived via z.infer<>, never hand-written separately.

import { z } from 'zod'

// The individual schema/type exports below (ColorKeySchema, PatternKeySchema,
// TaskStatusSchema, TextCardSchema, ImageCardSchema, LinkCardSchema,
// CardNodeSchema, ContainerNodeSchema) are this module's decomposed public
// API — used internally to compose NodeSchema now, and meant for later
// stages (cards/ kind-conversion and validation, Stage 6; per-kind
// components, Stage 4) to import directly rather than reaching through the
// top-level NodeSchema. Each is flagged as an unused export until those
// stages exist; suppressed rather than removed, per phase2 schema §2's
// explicit design (individually named/exported discriminated-union members).

// fallow-ignore-next-line unused-export
export const ColorKeySchema = z.enum([
  'gray',
  'coral',
  'orange',
  'amber',
  'lime',
  'teal',
  'sky',
  'violet',
  'pink',
])
export type ColorKey = z.infer<typeof ColorKeySchema>

// fallow-ignore-next-line unused-export
export const PatternKeySchema = z.enum([
  'none',
  'diagonal',
  'graph-paper',
  'wiggle',
  'plus',
  'jupiter',
  'topography',
  'yyy',
  'corkscrew',
])
export type PatternKey = z.infer<typeof PatternKeySchema>

// fallow-ignore-next-line unused-export
export const TaskStatusSchema = z.enum([
  'todo',
  'blocked',
  'in_progress',
  'done',
])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

export const SideSchema = z.enum(['top', 'right', 'bottom', 'left'])
// fallow-ignore-next-line unused-type
export type Side = z.infer<typeof SideSchema>

export const NodeIdSchema = z.string()
export type NodeId = z.infer<typeof NodeIdSchema>

const NodeBaseSchema = z.object({
  id: NodeIdSchema,
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  color: ColorKeySchema,
  task: z.object({ status: TaskStatusSchema }).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const CardBaseSchema = NodeBaseSchema.extend({
  type: z.literal('card'),
  content: z.string(),
})

// Free 8-way-resizable heading levels (h1 largest, h3 smallest), matching
// HTML heading conventions — spec §5.2. `h1` is the migrated name for what
// v0 called `'big'` (schema/legacy.ts backfills the old spelling).
// fallow-ignore-next-line unused-export
export const TextSizeSchema = z.enum(['regular', 'h1', 'h2', 'h3'])
export type TextSize = z.infer<typeof TextSizeSchema>

// fallow-ignore-next-line unused-export
export const TextCardSchema = CardBaseSchema.extend({
  kind: z.literal('text'),
  size: TextSizeSchema,
}).strict()
// fallow-ignore-next-line unused-type
export type TextCard = z.infer<typeof TextCardSchema>

// fallow-ignore-next-line unused-export
export const ImageCardSchema = CardBaseSchema.extend({
  kind: z.literal('image'),
  imageId: z.string(),
}).strict()
export type ImageCard = z.infer<typeof ImageCardSchema>

// fallow-ignore-next-line unused-export
export const LinkCardSchema = CardBaseSchema.extend({
  kind: z.literal('link'),
  link: z
    .object({
      url: z.string(),
      title: z.string().optional(),
      imageUrl: z.string().optional(),
      status: z.enum(['loading', 'ready', 'error']),
    })
    .strict(),
}).strict()
// fallow-ignore-next-line unused-type
export type LinkCard = z.infer<typeof LinkCardSchema>

// Nested discriminated union: every CardNode variant shares `type: 'card'`
// and is further discriminated on `kind`. zod v4's discriminatedUnion does
// not flatten a nested discriminated union member's own literal options
// into the outer discriminator's lookup table, so the outer Node union
// below uses z.union([...]) instead — see board.ts smoke test for coverage
// confirming both valid and invalid documents behave correctly under it.
// fallow-ignore-next-line unused-export
export const CardNodeSchema = z.discriminatedUnion('kind', [
  TextCardSchema,
  ImageCardSchema,
  LinkCardSchema,
])
// fallow-ignore-next-line unused-type
export type CardNode = z.infer<typeof CardNodeSchema>

// fallow-ignore-next-line unused-export
export const ContainerNodeSchema = NodeBaseSchema.extend({
  type: z.literal('container'),
  pattern: PatternKeySchema,
}).strict()
// fallow-ignore-next-line unused-type
export type ContainerNode = z.infer<typeof ContainerNodeSchema>

export const NodeSchema = z.union([CardNodeSchema, ContainerNodeSchema])
export type Node = z.infer<typeof NodeSchema>
