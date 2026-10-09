// Zod schemas for the v0 node shape, per
// ctx/notes/260915-prototype-migration-phase2-schema.md §2. Zod is the
// source of truth for the data model (AGENTS.md Stack) — every TS type
// here is derived via z.infer<>, never hand-written separately.

import { z } from 'zod'
import { BoardIdSchema } from './boardMeta'

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
  'falling-triangles',
  'leaf',
  'wiggle',
  'plus',
  'lines-in-motion',
  'topography',
  'rain',
  'squares',
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

// A node's `task` field: one of the four real statuses, or `'none'` for
// "not a task" (schema v7). Kept separate from `TaskStatus` so status-only
// consumers (the glyph, task-view accents) can't be handed `'none'` —
// narrow with `isTask` first.
// fallow-ignore-next-line unused-export
export const TaskFieldSchema = z.enum(['none', ...TaskStatusSchema.options])
export type TaskField = z.infer<typeof TaskFieldSchema>

/** True when `node` is a task (its `task` is a real status, not `'none'`). */
export function isTask<N extends { task: TaskField }>(
  node: N,
): node is N & { task: TaskStatus } {
  return node.task !== 'none'
}

export const SideSchema = z.enum(['top', 'right', 'bottom', 'left'])
// fallow-ignore-next-line unused-type
export type Side = z.infer<typeof SideSchema>

export const NodeIdSchema = z.string()
export type NodeId = z.infer<typeof NodeIdSchema>

// FK into `boards` (schema/boardMeta.ts) — every node belongs to exactly
// one board (schema v3, ctx/notes/260917-multiboard-support-design.md §2).
// `nodes` is a single flat array shared across all boards; filtering by
// `boardId` before rendering is what gives each board its own content and
// preserves that board's own relative z-order (array order among its own
// entries), regardless of how other boards' entries are interleaved.
// `status`/`position` added in schema v4 (`position` was named `index` until
// schema v7 — `INDEX` is a SQL keyword (reserved in MySQL and SQLite); see
// ctx/notes/261008-position-rename.md) (action-based undo/tombstoning,
// ctx/notes/260921-action-based-undo-and-tombstoning.md). `status` mirrors
// `BoardMeta`'s tombstone field (schema/boardMeta.ts) — delete is a
// `status: 'trashed'` update, not removal from the array, so a node keeps
// its array position (and so its z-order, still array-order-derived) until
// the reaper permanently purges it. `position` is an explicit per-board
// ordinal backfilled from each node's current array position at migration
// time — array order stays the live render/paint source of truth
// (unchanged), `position` exists purely so a future non-JSON backend has
// something explicit to sort by.
//
// `position` is deliberately a float (fractional-indexing/"LexoRank" style),
// not a dense integer, even though today's only writer
// (state/liveEntities.ts's `nextNodePosition`) happens to assign consecutive
// integers and nothing currently re-sorts an existing node (see
// ctx/notes/260921-action-based-undo-and-tombstoning.md's 260923 addendum
// under Q4 — the reorder atom/op that once existed for this was removed as
// unreachable from the UI). The float is future-proofing for if/when
// reordering ships: inserting a node between two existing ones (`A`, `B`)
// should be able to assign it `(A.position + B.position) / 2` — one field write —
// rather than renumbering every node after it. `z.number()` already
// accepts this; no runtime change follows from this comment. The one
// place it matters is a
// future SQL schema derived from this shape: that `position` column needs to
// be `DOUBLE PRECISION`/`REAL`, not `INTEGER`/`SERIAL`.
//
// `task` (schema v7, ctx/notes/261008-flat-task-status.md) is a required,
// bare `TaskField` enum value, not v6's optional `{ status }` wrapper
// object — it maps 1:1 onto a `NOT NULL DEFAULT 'none'` Postgres enum
// column (`CREATE TYPE task_status AS ENUM ('none', ...)`). "Not a task"
// is the explicit value `'none'`, never `null` or an absent key, so every
// update op records a concrete value for it (never a dropped key).
const NodeBaseSchema = z.object({
  id: NodeIdSchema,
  boardId: BoardIdSchema,
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  color: ColorKeySchema,
  task: TaskFieldSchema,
  status: z.enum(['active', 'trashed']),
  position: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// The node discriminator is `nodeType` ('card' | 'container') and a card's
// sub-discriminator is `cardType` ('text' | 'image' | 'link' | 'board') —
// named `type`/`kind` before schema v7, renamed so the two don't read as
// synonyms and neither shares its name with a SQL keyword (`TYPE`) —
// ctx/notes/261008-node-type-card-type-rename.md.
const CardBaseSchema = NodeBaseSchema.extend({
  nodeType: z.literal('card'),
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
  cardType: z.literal('text'),
  size: TextSizeSchema,
})
// fallow-ignore-next-line unused-type
export type TextCard = z.infer<typeof TextCardSchema>

// fallow-ignore-next-line unused-export
export const ImageCardSchema = CardBaseSchema.extend({
  cardType: z.literal('image'),
  imageId: z.string(),
})
export type ImageCard = z.infer<typeof ImageCardSchema>

// Link metadata is flat on the card (schema v7, ctx/notes/
// 261008-flat-link-fields.md), not v6's nested `link: { url, title?,
// imageUrl?, status }` object. `linkTitle`/`linkImageUrl` are `null` until
// a metadata fetch fills them, or when the page has none — never absent.
// The old `status` ('loading' | 'ready' | 'error') is not persisted at all:
// whether a fetch is in flight is in-memory app state
// (state/atoms/linkFetch.ts), so a card can't get stuck "Loading…" across
// a reload.
// fallow-ignore-next-line unused-export
export const LinkCardSchema = CardBaseSchema.extend({
  cardType: z.literal('link'),
  linkUrl: z.string(),
  linkTitle: z.string().nullable(),
  linkImageUrl: z.string().nullable(),
})
// fallow-ignore-next-line unused-type
export type LinkCard = z.infer<typeof LinkCardSchema>

// Usable only on the home board (the `isRoot` board, enforced by
// the state layer, not this schema — see
// ctx/notes/260917-multiboard-support-design.md §2/§3). No node-local
// title/caption field: the displayed title always resolves through
// `boards.find(b => b.id === boardRef).title`, the single source of
// truth for both on-canvas and breadcrumb rename. Never has a heading
// size. `content` (inherited from CardBaseSchema) is unused for display
// but kept for shape uniformity with the other CardNode variants.
// fallow-ignore-next-line unused-export
export const BoardCardSchema = CardBaseSchema.extend({
  cardType: z.literal('board'),
  boardRef: BoardIdSchema,
})
// fallow-ignore-next-line unused-type
export type BoardCard = z.infer<typeof BoardCardSchema>

// Nested discriminated union: every CardNode variant shares `nodeType: 'card'`
// and is further discriminated on `cardType`. zod v4's discriminatedUnion does
// not flatten a nested discriminated union member's own literal options
// into the outer discriminator's lookup table, so the outer Node union
// below uses z.union([...]) instead — see board.ts smoke test for coverage
// confirming both valid and invalid documents behave correctly under it.
// fallow-ignore-next-line unused-export
export const CardNodeSchema = z.discriminatedUnion('cardType', [
  TextCardSchema,
  ImageCardSchema,
  LinkCardSchema,
  BoardCardSchema,
])
// fallow-ignore-next-line unused-type
export type CardNode = z.infer<typeof CardNodeSchema>

// fallow-ignore-next-line unused-export
export const ContainerNodeSchema = NodeBaseSchema.extend({
  nodeType: z.literal('container'),
  pattern: PatternKeySchema,
})
// fallow-ignore-next-line unused-type
export type ContainerNode = z.infer<typeof ContainerNodeSchema>

export const NodeSchema = z.union([CardNodeSchema, ContainerNodeSchema])
export type Node = z.infer<typeof NodeSchema>
