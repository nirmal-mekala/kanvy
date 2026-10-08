// Normalize/backfill for legacy and pre-version documents (spec §2.7, §9).
// Runs BEFORE Zod validation (schema/board.ts) — its job is to turn
// whatever forgiving shape a prior version of the app (or a hand-edited
// export) produced into something the current BoardSchema accepts, never
// to fail. Two eras are handled:
//
//   1. Pre-v0 prototype documents: separate `cards`/`groups` arrays, flat
//      optional fields (`imageId`, `linkUrl`/`linkTitle`/`linkImageUrl`/
//      `linkStatus`, `textSize`, `taskStatus`), camelCase pattern keys, no
//      `h`/`version`/timestamps on every entity — the original prototype's
//      board.js/useBoard.js (`normalizeBoard`) shape this normalizes away
//      from.
//   2. Legacy v0-shaped documents (already `nodes`/`edges`/`images`) that
//      are simply missing `version` or per-entity timestamps, OR are a
//      pre-v0.1 (`version: 1`) document still carrying the formal `parentId`
//      ownership field that v0.1 (spec §2.3) removed — backfilled/stripped
//      in place rather than reconstructed, and always stamped with the
//      current `SCHEMA_VERSION` regardless of what version they arrived as.
//      A pre-v3 document (no `boards` array, no per-entity `boardId`) is
//      also normalized here: every node/edge is stamped with the root
//      board's id and a single synthesized root `boards` entry is added —
//      today's only board becomes "the root board" for free, with no data
//      loss and no user-visible change (multiboard support,
//      ctx/notes/260917-multiboard-support-design.md §2).
//
// Root-board designation (schema v6, ctx/notes/261006-root-board-isroot.md):
// every pre-v6 document identified its home board by the reserved id
// `'root'`. Migrating one mints a fresh id for that board, rewrites every
// `boardId`/`boardRef` that pointed at `'root'` to it, and stamps `isRoot`
// on every `boards` entry (true only for the old `'root'` board). A v6+
// document is never given this treatment — its `isRoot` flags and
// `boardId`s pass through untouched, and anything missing is left for
// `BoardSchema` to reject rather than guessed at.
//
// Flat task status (schema v7, ctx/notes/261008-flat-task-status.md): a
// pre-v7 node's optional `task: { status }` becomes a required bare
// `task: status`, or `task: 'none'` when it wasn't a task.
// Renames (schema v7, ctx/notes/261008-position-rename.md and
// 261008-node-type-card-type-rename.md): a pre-v7 node's `index`, `type` and
// `kind` become `position`, `nodeType` and `cardType`.
// Same rule as above — a v7+ node's fields pass through untouched.

import { customAlphabet } from 'nanoid'
import { SCHEMA_VERSION } from './board'
import type { PatternKey, TextSize } from './node'

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12)

/** The reserved home-board id every pre-v6 document used, before `isRoot` replaced it. Only ever read here, to recognize and migrate it. */
const LEGACY_ROOT_BOARD_ID = 'root'

/** The first schema version that designates the root board with `isRoot` instead of `LEGACY_ROOT_BOARD_ID`. */
const IS_ROOT_SCHEMA_VERSION = 6

/** The first schema version with v7's node field changes: a required bare `task` enum (`'none'` or a `TaskStatus`) instead of an optional `{ status }` object, `position` instead of `index`, and `nodeType`/`cardType` instead of `type`/`kind`. */
const V7_SCHEMA_VERSION = 7

// The prototype never stored a card's height (purely DOM-derived) — this
// mirrors its NEW_CARD_HEIGHT_ESTIMATE fallback, used here only to backfill
// the now-required `h` field for a legacy card that predates stored height
// (spec §2.4). Not the general "unrendered card" estimate used elsewhere in
// the app (that's a later stage's concern) — legacy-import-time only.
const LEGACY_CARD_HEIGHT_ESTIMATE = 90

// diagonalLines/graphPaper/jupiter/yyy/corkScrew were retired from the v0
// palette in favor of new patterns with no legacy equivalent — omitted here
// so an old document carrying one falls through to 'none' below.
const LEGACY_PATTERN_MAP: Record<string, PatternKey> = {
  none: 'none',
  wiggle: 'wiggle',
  plus: 'plus',
  topography: 'topography',
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

/** True for a document from before schema `version` — anything not explicitly stamped `version` or later, including every unversioned/pre-v0 document. */
function predates(parsed: Record<string, unknown>, version: number): boolean {
  return !(typeof parsed.version === 'number' && parsed.version >= version)
}

/** Maps a pre-v6 board reference (`boardId`/`boardRef`) onto the migrated root board's fresh id when it was the reserved `'root'`; any other value passes through. */
function migrateLegacyBoardRef(value: unknown, rootId: string): unknown {
  return value === LEGACY_ROOT_BOARD_ID ? rootId : value
}

/**
 * Pre-v6 only (`rootId` is the migrated root board's fresh id): stamps
 * `boardId` onto an entity from before multiboard support existed, and
 * repoints a `boardId`/`boardRef` of `'root'` at `rootId`. A v6+ entity
 * (`rootId` undefined) is returned untouched — a missing `boardId` there
 * is a real defect for `NodeSchema`/`EdgeSchema` to reject, not a legacy
 * gap to fill.
 */
function migrateBoardRefs(
  entity: Record<string, unknown>,
  rootId: string | undefined,
): Record<string, unknown> {
  if (rootId === undefined) return entity
  return {
    ...entity,
    boardId:
      typeof entity.boardId === 'string'
        ? migrateLegacyBoardRef(entity.boardId, rootId)
        : rootId,
    ...('boardRef' in entity
      ? { boardRef: migrateLegacyBoardRef(entity.boardRef, rootId) }
      : {}),
  }
}

/** Backfills a timestamp or two (already-v3 documents) and a default title/status onto every pre-existing `boards` entry. `isRoot` passes through exactly as given — see `normalizeBoardsCollection` for the pre-v6 case. */
function normalizeBoardEntries(
  parsed: Record<string, unknown>,
  now: string,
): Record<string, unknown>[] {
  if (!Array.isArray(parsed.boards)) return []
  return parsed.boards.filter(isRecord).map((board) => {
    const timestamped = backfillTimestamps(board, now)
    return {
      id: board.id,
      title: typeof board.title === 'string' ? board.title : 'Untitled board',
      status: board.status === 'trashed' ? 'trashed' : 'active',
      isRoot: board.isRoot,
      createdAt: timestamped.createdAt,
      updatedAt: timestamped.updatedAt,
    }
  })
}

/**
 * Normalizes a pre-existing `boards` array, and — for a pre-v6 document
 * (`rootId` defined) — migrates it onto `isRoot`: the reserved `'root'`
 * entry becomes `rootId` with `isRoot: true`, every other entry gets
 * `isRoot: false`, and a document with no `'root'` entry at all (every
 * pre-v3 document, which never had a `boards` array) gets one synthesized,
 * since every node/edge is about to be stamped with a `boardId` that must
 * resolve to *some* `boards` entry. A v6+ document is never given a
 * synthesized root — a missing or duplicated one fails `BoardSchema`.
 */
function normalizeBoardsCollection(
  parsed: Record<string, unknown>,
  now: string,
  rootId: string | undefined,
): Record<string, unknown>[] {
  const existing = normalizeBoardEntries(parsed, now)
  if (rootId === undefined) return existing
  const migrated = existing.map((board) => ({
    ...board,
    id: migrateLegacyBoardRef(board.id, rootId),
    isRoot: board.id === LEGACY_ROOT_BOARD_ID,
  }))
  if (migrated.some((board) => board.isRoot)) return migrated
  return [
    {
      id: rootId,
      title: 'Home',
      status: 'active' as const,
      isRoot: true,
      createdAt: now,
      updatedAt: now,
    },
    ...migrated,
  ]
}

/**
 * Backfills `status`/`position` (schema v4; `position` was `index` before
 * v7) onto a nodes array that already has `boardId` resolved on every
 * entry. `position` is assigned densely per
 * `boardId`, in the array's existing order — today's implicit
 * array-order-as-z-index becomes each node's explicit value, so migration
 * is behavior-preserving. Non-record entries pass through unchanged and
 * are left for `NodeSchema` to reject.
 */
function assignNodeStatusAndPosition(nodes: unknown[]): unknown[] {
  const counters = new Map<string, number>()
  return nodes.map((node) => {
    if (!isRecord(node)) return node
    const boardId = String(node.boardId)
    const next = counters.get(boardId) ?? 0
    counters.set(boardId, next + 1)
    return {
      ...node,
      status: node.status === 'trashed' ? 'trashed' : 'active',
      position: typeof node.position === 'number' ? node.position : next,
    }
  })
}

/** Backfills `status` (schema v4) onto an edges array. See `assignNodeStatusAndPosition`. */
function backfillEdgeStatuses(edges: unknown[]): unknown[] {
  return edges.map((edge) =>
    isRecord(edge)
      ? { ...edge, status: edge.status === 'trashed' ? 'trashed' : 'active' }
      : edge,
  )
}

/**
 * Normalizes `images` into schema v5's `{id, dataUri}[]` shape (design doc
 * §4) regardless of which era it arrived as: a pre-v5 `{ [id]: dataUri }`
 * record, an already-array v5 document, or anything unrecognizable (passed
 * through as `[]` and left for `BoardSchema` to reject if it wasn't
 * actually empty/valid).
 */
function normalizeImages(images: unknown): unknown[] {
  if (Array.isArray(images)) return images
  if (isRecord(images)) {
    return Object.entries(images)
      .filter(([, dataUri]) => typeof dataUri === 'string')
      .map(([id, dataUri]) => ({ id, dataUri }))
  }
  return []
}

/**
 * A pre-v7 entity's task as schema v7's required bare value
 * (ctx/notes/261008-flat-task-status.md): v0–v6's `task: { status }`
 * wrapper or the prototype's flat `taskStatus` string yields its status;
 * anything else — absent, `null`, a `{ status }`-less wrapper — is
 * `'none'` ("not a task"). An unrecognized status string passes through
 * for `NodeSchema` to reject.
 */
function normalizeTask(entity: Record<string, unknown>): string {
  if (isRecord(entity.task) && typeof entity.task.status === 'string') {
    return entity.task.status
  }
  if (typeof entity.task === 'string') return entity.task
  if (typeof entity.taskStatus === 'string') return entity.taskStatus
  return 'none'
}

/**
 * Pre-v7 only: applies schema v7's node field changes — `task` becomes
 * `normalizeTask`'s required value (ctx/notes/261008-flat-task-status.md),
 * `index` is renamed `position` (ctx/notes/261008-position-rename.md), and
 * `type`/`kind` are renamed `nodeType`/`cardType`
 * (ctx/notes/261008-node-type-card-type-rename.md). A v7+ node is never
 * touched — a missing/old-format `task` or a leftover `index`/`type`/`kind`
 * there is left for `NodeSchema` to reject or strip.
 */
function migrateToV7Node(
  node: Record<string, unknown>,
  predatesV7: boolean,
): Record<string, unknown> {
  if (!predatesV7) return node
  const { index, type, kind, ...rest } = node
  return {
    ...rest,
    ...(type !== undefined ? { nodeType: type } : {}),
    ...(kind !== undefined ? { cardType: kind } : {}),
    task: normalizeTask(node),
    ...(index !== undefined ? { position: index } : {}),
  }
}

function legacyCardKindFields(
  card: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof card.imageId === 'string') {
    return { cardType: 'image', imageId: card.imageId }
  }
  if (typeof card.linkUrl === 'string') {
    return {
      cardType: 'link',
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
  return {
    cardType: 'text',
    size: TEXT_SIZE_MAP[String(legacySize)] ?? 'regular',
  }
}

function normalizeLegacyCard(
  card: Record<string, unknown>,
  now: string,
  rootId: string,
): Record<string, unknown> {
  const base = backfillTimestamps(card, now)
  const task = normalizeTask(card)
  const h = typeof card.h === 'number' ? card.h : LEGACY_CARD_HEIGHT_ESTIMATE

  return {
    id: base.id,
    boardId: rootId,
    x: base.x,
    y: base.y,
    w: base.w,
    h,
    color: base.color ?? 'gray',
    task,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    nodeType: 'card' as const,
    content: typeof base.content === 'string' ? base.content : '',
    ...legacyCardKindFields(card),
  }
}

function normalizeLegacyGroup(
  group: Record<string, unknown>,
  now: string,
  rootId: string,
): Record<string, unknown> {
  const base = backfillTimestamps(group, now)
  const task = normalizeTask(group)
  const legacyPattern =
    typeof group.pattern === 'string'
      ? (LEGACY_PATTERN_MAP[group.pattern] ?? 'none')
      : 'none'

  return {
    id: base.id,
    boardId: rootId,
    x: base.x,
    y: base.y,
    w: base.w,
    h: base.h,
    color: base.color ?? 'gray',
    task,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    nodeType: 'container' as const,
    pattern: legacyPattern,
  }
}

function normalizeLegacyEdge(
  edge: Record<string, unknown>,
  now: string,
  rootId: string,
): Record<string, unknown> {
  const base = backfillTimestamps(edge, now)
  return {
    id: base.id,
    boardId: rootId,
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
  // Always pre-v6 (pre-v0 predates every version stamp) — see module comment.
  const rootId = generateId()
  return {
    version: SCHEMA_VERSION,
    // Containers first so array-order-as-z-index (phase 2 schema §1) keeps
    // them beneath cards on first render of a migrated board.
    nodes: assignNodeStatusAndPosition([
      ...groups
        .filter(isRecord)
        .map((group) => normalizeLegacyGroup(group, now, rootId)),
      ...cards
        .filter(isRecord)
        .map((card) => normalizeLegacyCard(card, now, rootId)),
    ]),
    edges: backfillEdgeStatuses(
      edges
        .filter(isRecord)
        .map((edge) => normalizeLegacyEdge(edge, now, rootId)),
    ),
    boards: normalizeBoardsCollection(parsed, now, rootId),
    images: normalizeImages(parsed.images),
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
  const rootId = predates(parsed, IS_ROOT_SCHEMA_VERSION)
    ? generateId()
    : undefined
  const predatesV7 = predates(parsed, V7_SCHEMA_VERSION)
  return {
    // Always stamp the current version — a v1 document migrating here has
    // just had `parentId` stripped, so it's no longer meaningfully "v1".
    version: SCHEMA_VERSION,
    nodes: assignNodeStatusAndPosition(
      nodes.map((node) =>
        isRecord(node)
          ? migrateBoardRefs(
              migrateToV7Node(
                migrateTextSize(stripParentId(backfillTimestamps(node, now))),
                predatesV7,
              ),
              rootId,
            )
          : node,
      ),
    ),
    edges: backfillEdgeStatuses(
      edges.map((edge) =>
        isRecord(edge)
          ? migrateBoardRefs(backfillTimestamps(edge, now), rootId)
          : edge,
      ),
    ),
    boards: normalizeBoardsCollection(parsed, now, rootId),
    images: normalizeImages(parsed.images),
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
