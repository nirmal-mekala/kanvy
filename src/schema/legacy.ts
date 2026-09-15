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
//      are simply missing `version` or per-entity timestamps — backfilled
//      in place rather than reconstructed.

import { customAlphabet } from 'nanoid'
import { SCHEMA_VERSION } from './board'
import type { PatternKey } from './node'

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
  return { kind: 'text', size: legacySize === 'big' ? 'big' : 'regular' }
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
    x: base.x,
    y: base.y,
    w: base.w,
    h,
    color: base.color ?? 'gray',
    ...(base.parentId !== undefined ? { parentId: base.parentId } : {}),
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
    x: base.x,
    y: base.y,
    w: base.w,
    h: base.h,
    color: base.color ?? 'gray',
    ...(base.parentId !== undefined ? { parentId: base.parentId } : {}),
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
    images: isRecord(parsed.images) ? parsed.images : {},
  }
}

function backfillV0Board(
  parsed: Record<string, unknown>,
  now: string,
): unknown {
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : []
  const edges = Array.isArray(parsed.edges) ? parsed.edges : []
  return {
    version:
      typeof parsed.version === 'number' ? parsed.version : SCHEMA_VERSION,
    nodes: nodes.map((node) =>
      isRecord(node) ? backfillTimestamps(node, now) : node,
    ),
    edges: edges.map((edge) =>
      isRecord(edge) ? backfillTimestamps(edge, now) : edge,
    ),
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
