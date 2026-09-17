// Normalize/backfill for legacy and pre-version documents (spec §2.7, §9).
// Runs BEFORE Zod validation (schema/board.ts) — its job is to turn
// whatever forgiving shape a prior version of the app (or a hand-edited
// export) produced into something the current BoardSchema accepts, never
// to fail. Two eras are handled:
//
//   1. Pre-v0 prototype documents: separate `cards`/`groups` arrays, flat
//      optional fields (`imageId`, `linkUrl`/`linkTitle`/`linkImageUrl`/
//      `linkStatus`, `textSize`, `taskStatus`), camelCase pattern keys, no
//      `h`/`version`/timestamps on every entity. See
//      ctx/support/260915-prototype-source/src/data/board.js and
//      src/state/useBoard.js (`normalizeBoard`) for the shape this
//      normalizes away from.
//   2. Legacy v0-shaped documents (already `nodes`/`edges`/`images`) that
//      are simply missing `version` or per-entity timestamps, OR are a
//      pre-v0.1 (`version: 1`) document still carrying the formal `parentId`
//      ownership field that v0.1 (spec §2.3) removed — backfilled/stripped
//      in place rather than reconstructed, and always stamped with the
//      current `SCHEMA_VERSION` regardless of what version they arrived as.
//      A pre-v3 document (no `boards` array, no per-entity `boardId`) is
//      also normalized here: every node/edge is stamped `boardId: 'root'`
//      and a single synthesized root `boards` entry is added — today's
//      only board becomes "the root board" for free, with no data loss and
//      no user-visible change (multiboard support,
//      ctx/notes/260917-multiboard-support-design.md §2).

import { customAlphabet } from 'nanoid'
import { SCHEMA_VERSION } from './board'
import { ROOT_BOARD_ID } from './boardMeta'
import type { PatternKey, TextSize } from './node'

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12)

// The prototype never stored a card's height (purely DOM-derived) — this
// mirrors its NEW_CARD_HEIGHT_ESTIMATE fallback, used here only to backfill
// the now-required `h` field for a legacy card that predates stored height
// (spec §2.4). Not the general "unrendered card" estimate used elsewhere in
// the app (that's a later stage's concern) — legacy-import-time only.
const LEGACY_CARD_HEIGHT_ESTIMATE = 90

const LEGACY_PATTERN_MAP: Record<string, PatternKey> = {
  none: 'none',
  diagonalLines: 'diagonal',
  graphPaper: 'graph-paper',
  wiggle: 'wiggle',
  plus: 'plus',
  jupiter: 'jupiter',
  topography: 'topography',
  yyy: 'yyy',
  corkScrew: 'corkscrew',
}

/** `'big'` was v0's only heading size, renamed `'h1'` when h2/h3 were added. */
const TEXT_SIZE_MAP: Record<string, TextSize> = {
  big: 'h1',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function nowISO(): string {
  return new Date().toISOString()
}

function backfillTimestamps(
  entity: Record<string, unknown>,
  now: string,
): Record<string, unknown> {
  return {
    ...entity,
    createdAt: typeof entity.createdAt === 'string' ? entity.createdAt : now,
    updatedAt: typeof entity.updatedAt === 'string' ? entity.updatedAt : now,
  }
}

/** Stamps `boardId: 'root'` onto an entity from before multiboard support existed, unless it already has one (a v3 document, or a pre-v3 document a caller has already stamped). */
function backfillBoardId(
  entity: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...entity,
    boardId:
      typeof entity.boardId === 'string' ? entity.boardId : ROOT_BOARD_ID,
  }
}

/**
 * Normalizes a pre-existing `boards` array (already-v3 documents just
 * missing a timestamp or two), or synthesizes the single root entry a
 * pre-v3 document never had. Either way, the reserved root board is always
 * present — a document that's missing it (or has an incomplete one) gets
 * it filled in, never left absent, since every node/edge is about to be
 * stamped with a `boardId` that must resolve to *some* `boards` entry.
 */
function normalizeBoardsCollection(
  parsed: Record<string, unknown>,
  now: string,
): Record<string, unknown>[] {
  const existing = Array.isArray(parsed.boards)
    ? parsed.boards.filter(isRecord).map((board) => {
        const timestamped = backfillTimestamps(board, now)
        return {
          id: board.id,
          title:
            typeof board.title === 'string' ? board.title : 'Untitled board',
          status: board.status === 'trashed' ? 'trashed' : 'active',
          createdAt: timestamped.createdAt,
          updatedAt: timestamped.updatedAt,
        }
      })
    : []
  if (existing.some((board) => board.id === ROOT_BOARD_ID)) return existing
  return [
    {
      id: ROOT_BOARD_ID,
      title: 'Home',
      status: 'active' as const,
      createdAt: now,
      updatedAt: now,
    },
    ...existing,
  ]
}

function normalizeTask(
  entity: Record<string, unknown>,
): { status: string } | undefined {
  if (isRecord(entity.task) && typeof entity.task.status === 'string') {
    return { status: entity.task.status }
  }
  if (typeof entity.taskStatus === 'string') {
    return { status: entity.taskStatus }
  }
  return undefined
}

function legacyCardKindFields(
  card: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof card.imageId === 'string') {
    return { kind: 'image', imageId: card.imageId }
  }
  if (typeof card.linkUrl === 'string') {
    return {
      kind: 'link',
      link: {
        url: card.linkUrl,
        title: typeof card.linkTitle === 'string' ? card.linkTitle : undefined,
        imageUrl:
          typeof card.linkImageUrl === 'string' ? card.linkImageUrl : undefined,
        status: typeof card.linkStatus === 'string' ? card.linkStatus : 'error',
      },
    }
  }
  const legacySize = card.textSize ?? card.size
  return { kind: 'text', size: TEXT_SIZE_MAP[String(legacySize)] ?? 'regular' }
}

function normalizeLegacyCard(
  card: Record<string, unknown>,
  now: string,
): Record<string, unknown> {
  const base = backfillTimestamps(card, now)
  const task = normalizeTask(card)
  const h = typeof card.h === 'number' ? card.h : LEGACY_CARD_HEIGHT_ESTIMATE

  return {
    id: base.id,
    boardId: ROOT_BOARD_ID,
    x: base.x,
    y: base.y,
    w: base.w,
    h,
    color: base.color ?? 'gray',
    ...(task !== undefined ? { task } : {}),
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    type: 'card' as const,
    content: typeof base.content === 'string' ? base.content : '',
    ...legacyCardKindFields(card),
  }
}

function normalizeLegacyGroup(
  group: Record<string, unknown>,
  now: string,
): Record<string, unknown> {
  const base = backfillTimestamps(group, now)
  const task = normalizeTask(group)
  const legacyPattern =
    typeof group.pattern === 'string'
      ? (LEGACY_PATTERN_MAP[group.pattern] ?? 'none')
      : 'none'

  return {
    id: base.id,
    boardId: ROOT_BOARD_ID,
    x: base.x,
    y: base.y,
    w: base.w,
    h: base.h,
    color: base.color ?? 'gray',
    ...(task !== undefined ? { task } : {}),
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    type: 'container' as const,
    pattern: legacyPattern,
  }
}

function normalizeLegacyEdge(
  edge: Record<string, unknown>,
  now: string,
): Record<string, unknown> {
  const base = backfillTimestamps(edge, now)
  return {
    id: base.id,
    boardId: ROOT_BOARD_ID,
    fromNodeId: base.fromNodeId ?? base.fromId,
    fromSide: base.fromSide,
    toNodeId: base.toNodeId ?? base.toId,
    toSide: base.toSide,
    direction: base.direction ?? 'none',
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
  }
}

/** True for a pre-v0 document — separate `cards`/`groups` arrays, no unified `nodes`. */
function isPreV0Shape(parsed: Record<string, unknown>): boolean {
  return (
    !Array.isArray(parsed.nodes) &&
    (Array.isArray(parsed.cards) || Array.isArray(parsed.groups))
  )
}

/** True for a document already shaped like a v0 Board (has a `nodes` array). */
function isV0Shape(parsed: Record<string, unknown>): boolean {
  return Array.isArray(parsed.nodes)
}

function normalizePreV0Board(
  parsed: Record<string, unknown>,
  now: string,
): unknown {
  const cards = Array.isArray(parsed.cards) ? parsed.cards : []
  const groups = Array.isArray(parsed.groups) ? parsed.groups : []
  const edges = Array.isArray(parsed.edges) ? parsed.edges : []
  return {
    version: SCHEMA_VERSION,
    // Containers first so array-order-as-z-index (phase 2 schema §1) keeps
    // them beneath cards on first render of a migrated board.
    nodes: [
      ...groups
        .filter(isRecord)
        .map((group) => normalizeLegacyGroup(group, now)),
      ...cards.filter(isRecord).map((card) => normalizeLegacyCard(card, now)),
    ],
    edges: edges.filter(isRecord).map((edge) => normalizeLegacyEdge(edge, now)),
    boards: normalizeBoardsCollection(parsed, now),
    images: isRecord(parsed.images) ? parsed.images : {},
  }
}

/**
 * Drops a v1 document's `parentId` (schema v2/"v0.1" removed formal
 * container ownership — see ctx/notes/260915-kanvy-spec.md §2.3). Container
 * membership re-derives purely from x/y/w/h, still present and untouched.
 */
function stripParentId(node: Record<string, unknown>): Record<string, unknown> {
  const { parentId: _parentId, ...rest } = node
  return rest
}

/** Remaps a legacy `size` value (e.g. `'big'` → `'h1'`) on an already v0-shaped node. No-op for a node with no `size` field (containers, image/link cards). */
function migrateTextSize(
  node: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof node.size !== 'string') return node
  return { ...node, size: TEXT_SIZE_MAP[node.size] ?? 'regular' }
}

function backfillV0Board(
  parsed: Record<string, unknown>,
  now: string,
): unknown {
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : []
  const edges = Array.isArray(parsed.edges) ? parsed.edges : []
  return {
    // Always stamp the current version — a v1 document migrating here has
    // just had `parentId` stripped, so it's no longer meaningfully "v1".
    version: SCHEMA_VERSION,
    nodes: nodes.map((node) =>
      isRecord(node)
        ? backfillBoardId(
            migrateTextSize(stripParentId(backfillTimestamps(node, now))),
          )
        : node,
    ),
    edges: edges.map((edge) =>
      isRecord(edge) ? backfillBoardId(backfillTimestamps(edge, now)) : edge,
    ),
    boards: normalizeBoardsCollection(parsed, now),
    images: isRecord(parsed.images) ? parsed.images : {},
  }
}

/**
 * Normalizes an arbitrary parsed JSON value into (an unvalidated,
 * best-effort) v0 Board shape. Never throws — genuinely malformed input
 * (not an object, arrays that aren't arrays) is passed through as close to
 * the target shape as possible and left for `BoardSchema.safeParse` to
 * reject; this function's job is leniency toward *recognizable* legacy
 * shapes, not full validation.
 */
export function normalizeLegacyBoard(parsed: unknown): unknown {
  if (!isRecord(parsed)) return parsed
  const now = nowISO()

  if (isPreV0Shape(parsed)) return normalizePreV0Board(parsed, now)
  if (isV0Shape(parsed)) return backfillV0Board(parsed, now)

  // Not recognizable as any known board shape — pass through unchanged so
  // BoardSchema rejects it, rather than fabricating an empty valid board
  // out of unrelated JSON (spec §9/Q14: "is this a Kanvy export?").
  return parsed
}

/** Fresh id generator for entities created during normalization/migration. */
export function generateId(): string {
  return nanoid()
}
