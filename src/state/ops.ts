// Hand-authored ops (schema v4, ctx/notes/260921-action-based-undo-and-
// tombstoning.md §2a) — the unit the undo/redo stack now records instead
// of a whole `Board` snapshot per step, and (developer's explicit
// preference over the doc's own "recommended" auto-diff alternative) the
// unit every mutation atom builds directly at its own call site, rather
// than a diff derived after the fact from a whole-board updater's output.
//
// Two op kinds cover every mutation this app makes: `create` (append a
// brand-new node/edge/board entry) and `update` (a field patch — this also
// covers tombstoning, since delete is now just `{status: 'trashed'}`, and
// reordering, since v0.1... no — schema v4's explicit `index` field means
// reordering is just an ordinary per-node `update` too; see Q4 in the
// design doc). No dedicated reorder/delete op type exists. `image` is a
// third, narrower kind for `images: Record<string, string>` — not an
// ordered entity array, so it doesn't fit the node/edge/board shape.
//
// `applyOps` is the single interpreter both a mutation atom (moving
// forward) and undo/redo (moving forward or backward) go through — see
// state/history/boardHistoryAtom.ts.

import type { Board } from '../schema/board'
import type { BoardMeta } from '../schema/boardMeta'
import type { Edge } from '../schema/edge'
import type { Node } from '../schema/node'

export type EntityKind = 'node' | 'edge' | 'board'

interface EntityById {
  id: string
}

export interface CreateOp {
  kind: 'create'
  entity: EntityKind
  value: Node | Edge | BoardMeta
}

export interface UpdateOp {
  kind: 'update'
  entity: EntityKind
  id: string
  /** The touched fields' values immediately before this op (for undo). */
  before: Record<string, unknown>
  /** The touched fields' values immediately after this op (for redo). */
  after: Record<string, unknown>
}

/** `images` isn't an ordered entity array (schema/board.ts), so it gets its own narrower op shape — `undefined` means "the key didn't exist." */
export interface ImageOp {
  kind: 'image'
  id: string
  before: string | undefined
  after: string | undefined
}

/**
 * A full-document swap — the one exception to "every mutation is a
 * per-entity create/update" (state/history/boardHistoryAtom.ts's
 * `acknowledgeRecoveryAtom`): a corrupt-data recovery has no prior *valid*
 * board to diff against, so it force-overwrites with `before === after`
 * rather than per-entity ops. Kept to this one call site rather than a
 * general escape hatch.
 */
export interface ReplaceBoardOp {
  kind: 'replace-board'
  before: Board
  after: Board
}

export type Op = CreateOp | UpdateOp | ImageOp | ReplaceBoardOp

export type Direction = 'after' | 'before'

/**
 * Why a batch of ops is being persisted — locally only `Direction` matters
 * (`'do'`/`'redo'` apply `'after'`, `'undo'` applies `'before'`), but a
 * network backend also needs to know whether a `create` is happening for
 * the first time (`'do'`: POST) or being re-applied after an undo
 * (`'redo'`: the entity already exists server-side, tombstoned by that
 * undo — reactivate it, never POST again). See api/networkOps.ts and
 * ctx/notes/261008-network-undo-redo.md.
 */
export type OpReplay = 'do' | 'undo' | 'redo'

/**
 * The ops a step applied plus which board's action produced it — the unit
 * `history/reducer.ts`'s generic history stack is instantiated over in
 * `history/boardHistoryAtom.ts` (schema v4). Kept here rather than in
 * boardHistoryAtom.ts itself so state/entityReconcile.ts and
 * state/networkReconcile.ts can reference the shape without importing
 * boardHistoryAtom.ts — which itself pulls in api/boardApi.ts's network
 * save path, and would otherwise close a circular import back through
 * api/networkOps.ts (see networkReconcile.ts's own module comment).
 */
export interface AttributedOps {
  ops: Op[]
  boardId: string
}

/**
 * Merges `patch` onto `entity` — a key whose patch value is `undefined`
 * *deletes* that key rather than setting it to `undefined` (matches this
 * codebase's own exactOptionalPropertyTypes-aware convention for dropping
 * an optional field, so a patch built from a before/after diff that
 * added or removed a key round-trips correctly — e.g. undoing
 * `setTaskKindAtom` on a node that had no `task` key at all).
 */
function applyPatch<E extends object>(
  entity: E,
  patch: Record<string, unknown>,
): E {
  const result: Record<string, unknown> = { ...entity } as Record<
    string,
    unknown
  >
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete result[key]
    else result[key] = value
  }
  return result as unknown as E
}

function applyEntityOp<E extends EntityById>(
  entities: readonly E[],
  op: CreateOp | UpdateOp,
  direction: Direction,
): E[] {
  if (op.kind === 'create') {
    if (direction === 'after') return [...entities, op.value as unknown as E]
    return entities.filter((entity) => entity.id !== op.value.id)
  }
  const patch = direction === 'after' ? op.after : op.before
  return entities.map((entity) =>
    entity.id === op.id ? applyPatch(entity, patch) : entity,
  )
}

function applyImageOp(board: Board, op: ImageOp, direction: Direction): Board {
  const value = direction === 'after' ? op.after : op.before
  if (value === undefined) {
    return {
      ...board,
      images: board.images.filter((entry) => entry.id !== op.id),
    }
  }
  const exists = board.images.some((entry) => entry.id === op.id)
  const images = exists
    ? board.images.map((entry) =>
        entry.id === op.id ? { ...entry, dataUri: value } : entry,
      )
    : [...board.images, { id: op.id, dataUri: value }]
  return { ...board, images }
}

function applyOp(board: Board, op: Op, direction: Direction): Board {
  if (op.kind === 'image') return applyImageOp(board, op, direction)
  if (op.kind === 'replace-board') {
    return direction === 'after' ? op.after : op.before
  }
  switch (op.entity) {
    case 'node':
      return { ...board, nodes: applyEntityOp(board.nodes, op, direction) }
    case 'edge':
      return { ...board, edges: applyEntityOp(board.edges, op, direction) }
    case 'board':
      return { ...board, boards: applyEntityOp(board.boards, op, direction) }
  }
}

/**
 * Replays `ops` against `board`. `'after'` moves forward (a mutation atom's
 * own effect, or a redo): create → append, update → merge `after`, image →
 * set to `after`. `'before'` moves backward (an undo), applied in reverse
 * op order: create → remove by id, update → merge `before`, image → set to
 * `before` (removing the key if it was `undefined`, i.e. didn't exist yet).
 */
export function applyOps(
  board: Board,
  ops: readonly Op[],
  direction: Direction,
): Board {
  const sequence = direction === 'after' ? ops : [...ops].reverse()
  return sequence.reduce(
    (current, op) => applyOp(current, op, direction),
    board,
  )
}

function opTargetKey(op: Op): string {
  if (op.kind === 'image') return `image:${op.id}`
  if (op.kind === 'replace-board') return 'replace-board'
  if (op.kind === 'create') return `${op.entity}:${op.value.id}`
  return `${op.entity}:${op.id}`
}

/**
 * Merges `incoming`'s effect into `existing` (both already targeting the
 * same entity, per `opTargetKey`) — `before` favors `existing`'s (the
 * earlier-in-the-gesture, closer-to-original value), `after` favors
 * `incoming`'s (the more recent one), so a merged entry undoes all the way
 * back to before the whole coalesced gesture, not just its last increment.
 */
function mergeOp(existing: Op, incoming: Op): Op {
  if (existing.kind === 'create' && incoming.kind === 'update') {
    // The entity was created and then patched again within the same
    // coalesce window (e.g. create-then-immediately-resize) — fold the
    // patch straight into the create's own value rather than keeping two
    // ops, so undoing this entry is still a single "remove by id." Same
    // merge rule as `applyPatch` — a field the patch removed is dropped
    // from the created value, not kept as an `undefined` key.
    return {
      ...existing,
      value: applyPatch(existing.value, incoming.after),
    }
  }
  if (existing.kind === 'image' && incoming.kind === 'image') {
    return { ...incoming, before: existing.before }
  }
  if (existing.kind === 'update' && incoming.kind === 'update') {
    return {
      ...incoming,
      before: { ...incoming.before, ...existing.before },
      after: { ...existing.after, ...incoming.after },
    }
  }
  // Any other combination (e.g. two `create`s racing for the same id,
  // which shouldn't happen given client-generated ids) — the newer op
  // wins; not expected to be reached in practice.
  return incoming
}

/**
 * Merges `newOps` into `prevOps` for coalescing (reducer.ts's `pushUpdate`
 * `merge` param, wired in state/history/boardHistoryAtom.ts) — an op
 * targeting the same entity as one already in `prevOps` merges into it
 * (see `mergeOp`); anything else is appended.
 */
export function mergeOpLists(
  prevOps: readonly Op[],
  newOps: readonly Op[],
): Op[] {
  const merged: Op[] = [...prevOps]
  for (const incoming of newOps) {
    const index = merged.findIndex(
      (existing) => opTargetKey(existing) === opTargetKey(incoming),
    )
    if (index === -1) {
      merged.push(incoming)
    } else {
      const existing = merged[index]
      if (existing) merged[index] = mergeOp(existing, incoming)
    }
  }
  return merged
}
