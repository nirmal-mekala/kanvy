// The network-mode reaper's I/O half
// (ctx/notes/261009-network-reaper-and-image-lifecycle.md): fetches reap
// candidates straight from the server (not the partially loaded live
// document), plans with state/networkReapPlan.ts, and hard-deletes in the
// plan's order: edges, nodes, boards, then images.
//
// Every delete is one explicit request. Nothing relies on a server-side
// cascade (no json-server `?_dependent=`), so the behavior is the same on a
// backend with real foreign keys. A failed delete is `console.warn`ed and
// skipped along with everything that depends on it; the next network start
// retries. Query construction stays in this module (json-server v1 filter
// syntax) so another backend's adapter can swap it.

import type { z } from 'zod'
import { BoardMetaSchema } from '../schema/boardMeta'
import { EdgeSchema } from '../schema/edge'
import { type Node, NodeSchema } from '../schema/node'
import type { NetworkConfig } from '../state/atoms/networkSettings'
import {
  candidateNodeIds,
  imageCandidateIds,
  type NetworkReapPlan,
  planNetworkReap,
  reapCandidateBoardIds,
  unreferencedImageIds,
} from '../state/networkReapPlan'
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

/** Ids per `field:in` query — keeps request URLs a sane length. */
const IN_QUERY_CHUNK = 50

const TRASHED = { status: 'trashed' }

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
    query: Record<string, string>,
  ): Promise<EntryOf<C>[]> {
    const entries = await fetchCollection(
      config,
      collection,
      SCHEMAS[collection],
      query,
      fetchImpl,
    )
    checkpoint()
    return entries as EntryOf<C>[]
  }
  return {
    checkpoint,
    fetchWhere,
    /** Every `collection` entry whose `field` is one of `values` — chunked `field:in` queries, none at all for an empty list. */
    async fetchIn<C extends Collection>(
      collection: C,
      field: string,
      values: readonly string[],
    ): Promise<EntryOf<C>[]> {
      const results: EntryOf<C>[] = []
      for (const chunk of chunks(values, IN_QUERY_CHUNK)) {
        results.push(
          ...(await fetchWhere(collection, {
            [`${field}:in`]: chunk.join(','),
          })),
        )
      }
      return results
    },
    /** Deletes one entity, adding `id` to `deleted` on success — before the stop check, so a run stopped right after still reports it. A refusal is only warned about. */
    async tryDelete(
      collection: string,
      id: string,
      deleted: Set<string>,
    ): Promise<void> {
      try {
        await deleteEntity(config, collection, id, fetchImpl)
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

/**
 * Deletes each of `items` from `collection` once everything it depends on
 * (`prerequisites(item)`) is in `deletedSoFar`, recording each success in
 * `deleted`. Anything with a failed prerequisite is skipped, so a real
 * backend's foreign keys never see a delete they'd reject.
 */
async function deleteInOrder<T extends { id: string }>(
  context: ReapContext,
  collection: string,
  items: readonly T[],
  prerequisites: (item: T) => readonly string[],
  deletedSoFar: ReadonlySet<string>,
  deleted: Set<string>,
): Promise<void> {
  for (const item of items) {
    const blockedBy = prerequisites(item).filter((id) => !deletedSoFar.has(id))
    if (blockedBy.length > 0) {
      console.warn(
        `Network reaper: skipping ${collection}/${item.id} — ${blockedBy.join(', ')} weren't deleted`,
      )
      continue
    }
    await context.tryDelete(collection, item.id, deleted)
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
    await context.tryDelete('images', imageId, deleted)
  }
}

async function executePlan(
  context: ReapContext,
  plan: NetworkReapPlan,
  result: NetworkReapResult,
): Promise<void> {
  for (const board of plan.skippedBoards) {
    console.warn(
      `Network reaper: skipping boards/${board.id} — ${board.reason}`,
    )
  }
  const edges = new Set<string>()
  const nodes = new Set<string>()
  const boards = new Set<string>()
  const images = new Set<string>()
  // Live views, so a run stopped part-way still reports what it deleted.
  result.edgeIds = edges
  result.nodeIds = nodes
  result.boardIds = boards
  result.imageIds = images
  for (const id of plan.edgeIds) {
    await context.tryDelete('edges', id, edges)
  }
  await deleteInOrder(
    context,
    'nodes',
    plan.nodes,
    (node) => node.edgeIds,
    edges,
    nodes,
  )
  await deleteInOrder(
    context,
    'boards',
    plan.boards,
    (board) => [...board.nodeIds, ...board.edgeIds],
    new Set([...nodes, ...edges]),
    boards,
  )
  await deleteUnreferencedImages(
    context,
    imageCandidateIds(plan, nodes),
    images,
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
    await executePlan(context, await fetchPlan(context, now), result)
  } catch (error) {
    if (!(error instanceof ReapStopped)) throw error
  }
  return result
}
