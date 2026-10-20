// The network-mode reaper's I/O half
// (ctx/notes/261009-network-reaper-and-image-lifecycle.md): fetches reap
// candidates straight from the server (not the partially loaded live
// document), plans with state/networkReapPlan.ts, and hard-deletes in
// dependency order: edges before the nodes they touch, nodes before the
// boards they're on, then images.
//
// Deletes are written to be safe against the Postgres schema's foreign keys
// whatever their ON DELETE rule (ctx/notes/261020-safe-network-deletes.md):
// - Every delete is one explicit request for one row, and never relies on
//   a cascade (no json-server `?_dependent=`).
// - Every delete is *guarded* with the condition that put it in the plan
//   (`deleteGuards`) — still trashed and aged, or still on the board being
//   reaped — so a row that changed after planning is left alone. Atomic on
//   a dialect with `atomicDeleteGuards` (PostgREST), best effort otherwise.
// - A board's content is only deleted after re-reading that the board
//   itself still qualifies, right before.
// - Before a node or board delete, the reaper re-reads that nothing still
//   references it, so an ON DELETE CASCADE (`nodes.board_id`) can never take
//   a row with it that the plan didn't cover, and a RESTRICT never rejects.
// A failed or refused delete is `console.warn`ed and skipped along with
// everything that depends on it; the next network start retries. Filters
// are this app's own field names; the connection's dialect spells them for
// the wire (api/dialects/).

import type { z } from 'zod'
import { BoardMetaSchema } from '../schema/boardMeta'
import { EdgeSchema } from '../schema/edge'
import { type Node, NodeSchema } from '../schema/node'
import type { NetworkConfig } from '../state/atoms/networkSettings'
import {
  candidateNodeIds,
  type DeleteReason,
  imageCandidateIds,
  type NetworkReapPlan,
  type PlannedBoardDelete,
  type PlannedNodeDelete,
  planNetworkReap,
  reapCandidateBoardIds,
  unreferencedImageIds,
} from '../state/networkReapPlan'
import { NODE_REAP_AGE_MS, REAP_AGE_MS } from '../state/reaper'
import type {
  Collection as DialectCollection,
  FieldOf,
  Filter,
} from './dialects/types'
import { deleteEntity, fetchCollection } from './restClient'

/** What the reaper actually deleted on the server. */
export interface NetworkReapResult {
  edgeIds: Set<string>
  nodeIds: Set<string>
  boardIds: Set<string>
  imageIds: Set<string>
}

interface NetworkReapOptions {
  /** Checked after every await; once it returns false the run stops issuing requests and returns what it has deleted so far. */
  shouldContinue?: () => boolean
  fetchImpl?: typeof fetch
}

const SCHEMAS = {
  boards: BoardMetaSchema,
  nodes: NodeSchema,
  edges: EdgeSchema,
}

type Collection = keyof typeof SCHEMAS
type EntryOf<C extends Collection> = z.infer<(typeof SCHEMAS)[C]>

/** Ids per `in` filter — keeps request URLs a sane length. */
const IN_QUERY_CHUNK = 50

const TRASHED = [{ field: 'status', op: 'eq', value: 'trashed' }] as const

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }
  return result
}

class ReapStopped extends Error {}

function createReapContext(config: NetworkConfig, options: NetworkReapOptions) {
  const fetchImpl = options.fetchImpl ?? fetch
  const shouldContinue = options.shouldContinue ?? (() => true)
  const checkpoint = () => {
    if (!shouldContinue()) throw new ReapStopped()
  }
  async function fetchWhere<C extends Collection>(
    collection: C,
    filters: readonly Filter<C>[],
  ): Promise<EntryOf<C>[]> {
    const entries = await fetchCollection(
      config,
      collection,
      SCHEMAS[collection],
      filters,
      fetchImpl,
    )
    checkpoint()
    return entries as EntryOf<C>[]
  }
  return {
    checkpoint,
    fetchWhere,
    /** Every `collection` entry whose `field` is one of `values` — chunked `in` filters, none at all for an empty list. */
    async fetchIn<C extends Collection>(
      collection: C,
      field: FieldOf<C>,
      values: readonly string[],
    ): Promise<EntryOf<C>[]> {
      const results: EntryOf<C>[] = []
      for (const chunk of chunks(values, IN_QUERY_CHUNK)) {
        results.push(
          ...(await fetchWhere(collection, [
            { field, op: 'in', values: chunk },
          ])),
        )
      }
      return results
    },
    /** Deletes one entity if it still meets `guards`, adding `id` to `deleted` on success — before the stop check, so a run stopped right after still reports it. A refusal is only warned about. */
    async tryDelete<C extends DialectCollection>(
      collection: C,
      id: string,
      guards: readonly Filter<C>[],
      deleted: Set<string>,
    ): Promise<void> {
      try {
        await deleteEntity(config, collection, id, guards, fetchImpl)
        deleted.add(id)
      } catch (error) {
        console.warn(
          `Network reaper: couldn't delete ${collection}/${id}`,
          error,
        )
      }
      checkpoint()
    },
  }
}

type ReapContext = ReturnType<typeof createReapContext>

async function fetchPlan(
  context: ReapContext,
  now: number,
): Promise<NetworkReapPlan> {
  const trashedBoards = await context.fetchWhere('boards', TRASHED)
  const trashedNodes = await context.fetchWhere('nodes', TRASHED)
  const trashedEdges = await context.fetchWhere('edges', TRASHED)
  const boardIds = reapCandidateBoardIds(trashedBoards, now)
  const boardNodes = await context.fetchIn('nodes', 'boardId', boardIds)
  const boardEdges = await context.fetchIn('edges', 'boardId', boardIds)
  const boardCards = await context.fetchIn('nodes', 'boardRef', boardIds)
  const nodeIds = candidateNodeIds({ trashedNodes, boardNodes }, now)
  const touchingEdges = [
    ...(await context.fetchIn('edges', 'fromNodeId', nodeIds)),
    ...(await context.fetchIn('edges', 'toNodeId', nodeIds)),
  ]
  return planNetworkReap(
    {
      trashedBoards,
      trashedNodes,
      trashedEdges,
      boardNodes,
      boardEdges,
      boardCards,
      touchingEdges,
    },
    now,
  )
}

/** The `updatedAt` a tombstone must be older than to be reaped, as of `now` — the same strict boundary as state/reaper.ts. */
interface Cutoffs {
  board: string
  node: string
}

function cutoffsAt(now: number): Cutoffs {
  return {
    board: new Date(now - REAP_AGE_MS).toISOString(),
    node: new Date(now - NODE_REAP_AGE_MS).toISOString(),
  }
}

function tombstoneGuards<C extends Collection>(cutoff: string): Filter<C>[] {
  return [
    { field: 'status', op: 'eq', value: 'trashed' },
    { field: 'updatedAt', op: 'before', value: cutoff },
  ] as Filter<C>[]
}

/** The condition that put a node/edge in the plan, as delete guards. */
function deleteGuards<C extends 'nodes' | 'edges'>(
  reason: DeleteReason,
  cutoffs: Cutoffs,
): Filter<C>[] {
  switch (reason.kind) {
    case 'tombstone':
      return tombstoneGuards(cutoffs.node)
    case 'on-board':
      return [
        { field: 'boardId', op: 'eq', value: reason.boardId },
      ] as Filter<C>[]
    case 'touching':
      return [
        { field: 'fromNodeId', op: 'eq', value: reason.fromNodeId },
        { field: 'toNodeId', op: 'eq', value: reason.toNodeId },
      ] as Filter<C>[]
  }
}

interface Deleted {
  edges: Set<string>
  nodes: Set<string>
  boards: Set<string>
  images: Set<string>
}

/** `ids` minus the ones whose prerequisites aren't all in `done` — each skip is warned about. */
function withPrerequisitesMet<T extends { id: string }>(
  collection: Collection,
  items: readonly T[],
  prerequisites: (item: T) => readonly string[],
  done: ReadonlySet<string>,
): T[] {
  return items.filter((item) => {
    const blockedBy = prerequisites(item).filter((id) => !done.has(id))
    if (blockedBy.length === 0) return true
    console.warn(
      `Network reaper: skipping ${collection}/${item.id} — ${blockedBy.join(', ')} weren't deleted`,
    )
    return false
  })
}

async function deleteEdges(
  context: ReapContext,
  edges: NetworkReapPlan['edges'],
  cutoffs: Cutoffs,
  deleted: Deleted,
): Promise<void> {
  for (const edge of edges) {
    await context.tryDelete(
      'edges',
      edge.id,
      deleteGuards(edge.reason, cutoffs),
      deleted.edges,
    )
  }
}

/**
 * Deletes `nodes` whose planned edges are all gone, after re-reading that
 * no other edge (one created since planning) still touches them — an edge
 * foreign key would otherwise reject the delete, or cascade into an edge
 * the plan never saw.
 */
async function deleteNodes(
  context: ReapContext,
  nodes: readonly PlannedNodeDelete[],
  cutoffs: Cutoffs,
  deleted: Deleted,
): Promise<void> {
  const ready = withPrerequisitesMet(
    'nodes',
    nodes,
    (node) => node.edgeIds,
    deleted.edges,
  )
  const ids = ready.map((node) => node.id)
  const touching = [
    ...(await context.fetchIn('edges', 'fromNodeId', ids)),
    ...(await context.fetchIn('edges', 'toNodeId', ids)),
  ]
  for (const node of ready) {
    const edge = touching.find(
      (e) => e.fromNodeId === node.id || e.toNodeId === node.id,
    )
    if (edge) {
      console.warn(
        `Network reaper: skipping nodes/${node.id} — still touched by edges/${edge.id}`,
      )
      continue
    }
    await context.tryDelete(
      'nodes',
      node.id,
      deleteGuards(node.reason, cutoffs),
      deleted.nodes,
    )
  }
}

/** Re-reads that `boardId` is still an aged, trashed, non-root board — right before anything on it is deleted. */
async function boardStillReapable(
  context: ReapContext,
  boardId: string,
  cutoffs: Cutoffs,
): Promise<boolean> {
  const rows = await context.fetchWhere('boards', [
    { field: 'id', op: 'eq', value: boardId },
    ...tombstoneGuards<'boards'>(cutoffs.board),
  ])
  if (rows.length === 1 && rows[0]?.isRoot === false) return true
  console.warn(
    `Network reaper: skipping boards/${boardId} — no longer an aged, trashed board`,
  )
  return false
}

/** Re-reads that no node or edge still references `boardId` — under `nodes.board_id ON DELETE CASCADE`, deleting a board would silently take any such row with it. */
async function boardUnreferenced(
  context: ReapContext,
  boardId: string,
): Promise<boolean> {
  const on = { field: 'boardId', op: 'eq', value: boardId } as const
  const referencing = [
    ...(await context.fetchWhere('nodes', [on])),
    ...(await context.fetchWhere('nodes', [
      { field: 'boardRef', op: 'eq', value: boardId },
    ])),
    ...(await context.fetchWhere('edges', [on])),
  ]
  if (referencing.length === 0) return true
  console.warn(
    `Network reaper: skipping boards/${boardId} — still referenced by ${referencing.map((row) => row.id).join(', ')}`,
  )
  return false
}

/** Each board's own content, once a fresh read confirms the board still qualifies; returns the boards that did. */
async function deleteBoardContent(
  context: ReapContext,
  plan: NetworkReapPlan,
  cutoffs: Cutoffs,
  deleted: Deleted,
): Promise<PlannedBoardDelete[]> {
  const confirmed: PlannedBoardDelete[] = []
  for (const board of plan.boards) {
    if (!(await boardStillReapable(context, board.id, cutoffs))) continue
    confirmed.push(board)
    const onThisBoard = (item: { reason: DeleteReason }) =>
      item.reason.kind === 'on-board' && item.reason.boardId === board.id
    await deleteEdges(context, plan.edges.filter(onThisBoard), cutoffs, deleted)
    await deleteNodes(context, plan.nodes.filter(onThisBoard), cutoffs, deleted)
  }
  return confirmed
}

async function deleteBoards(
  context: ReapContext,
  boards: readonly PlannedBoardDelete[],
  cutoffs: Cutoffs,
  deleted: Deleted,
): Promise<void> {
  const ready = withPrerequisitesMet(
    'boards',
    boards,
    (board) => [...board.nodeIds, ...board.edgeIds],
    new Set([...deleted.nodes, ...deleted.edges]),
  )
  for (const board of ready) {
    if (!(await boardUnreferenced(context, board.id))) continue
    await context.tryDelete(
      'boards',
      board.id,
      tombstoneGuards(cutoffs.board),
      deleted.boards,
    )
  }
}

/**
 * Deletes `imageIds` that no node row of any status (live, trashed, on any
 * board) still references. Images are shared by copy/paste/duplicate,
 * possibly across boards, so this server check is the only safe test — and
 * on json-server, which has no foreign keys, the only safety net.
 */
async function deleteUnreferencedImages(
  context: ReapContext,
  imageIds: readonly string[],
  deleted: Set<string>,
): Promise<void> {
  if (imageIds.length === 0) return
  let referencing: Node[]
  try {
    referencing = await context.fetchIn('nodes', 'imageId', imageIds)
  } catch (error) {
    if (error instanceof ReapStopped) throw error
    console.warn("Network reaper: couldn't check image references", error)
    return
  }
  for (const imageId of unreferencedImageIds(imageIds, referencing)) {
    await context.tryDelete('images', imageId, [], deleted)
  }
}

/**
 * Standalone tombstones first (edges, then nodes — they don't depend on
 * any board's fate), then each confirmed board's content, then the boards,
 * then the images the deleted image cards leave unreferenced.
 */
async function executePlan(
  context: ReapContext,
  plan: NetworkReapPlan,
  now: number,
  result: NetworkReapResult,
): Promise<void> {
  for (const board of plan.skippedBoards) {
    console.warn(
      `Network reaper: skipping boards/${board.id} — ${board.reason}`,
    )
  }
  const cutoffs = cutoffsAt(now)
  // Live views, so a run stopped part-way still reports what it deleted.
  const deleted: Deleted = {
    edges: result.edgeIds,
    nodes: result.nodeIds,
    boards: result.boardIds,
    images: result.imageIds,
  }
  const standalone = (item: { reason: DeleteReason }) =>
    item.reason.kind !== 'on-board'
  await deleteEdges(context, plan.edges.filter(standalone), cutoffs, deleted)
  await deleteNodes(context, plan.nodes.filter(standalone), cutoffs, deleted)
  const confirmed = await deleteBoardContent(context, plan, cutoffs, deleted)
  await deleteBoards(context, confirmed, cutoffs, deleted)
  await deleteUnreferencedImages(
    context,
    imageCandidateIds(plan, deleted.nodes),
    deleted.images,
  )
}

/**
 * Hard-deletes every aged, trashed board/node/edge on the server (and the
 * images their reap leaves unreferenced). A single failed delete never
 * throws; a failure to fetch the candidates does (nothing was deleted
 * yet). Stops early, returning what it has deleted so far, once
 * `shouldContinue` returns false.
 */
export async function runNetworkReap(
  config: NetworkConfig,
  now: number,
  options: NetworkReapOptions = {},
): Promise<NetworkReapResult> {
  const context = createReapContext(config, options)
  const result: NetworkReapResult = {
    edgeIds: new Set(),
    nodeIds: new Set(),
    boardIds: new Set(),
    imageIds: new Set(),
  }
  try {
    context.checkpoint()
    await executePlan(context, await fetchPlan(context, now), now, result)
  } catch (error) {
    if (!(error instanceof ReapStopped)) throw error
  }
  return result
}
