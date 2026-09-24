// Network mode's read path (network mode design doc §6a-c) — loads
// boards/nodes/edges/images from the REST backend and merges them into the
// same flat `Board` document shape `currentBoardAtom` already holds, so
// every existing reader (getLiveNodes/getLiveEdges, containment, etc.)
// keeps working unchanged regardless of which mode supplied the data.
//
// Every "fetch all" request goes through TanStack Query's `fetchQuery`
// (not a hand-rolled in-flight cache) — this gives concurrent callers for
// the same board automatic de-duplication and, on a repeat call, the
// cached result instantly (design doc §6c's "if already loaded via
// prefetch, navigate immediately").

import { atom, getDefaultStore } from 'jotai'
import { resetIdRemapTable } from '../api/networkOps'
import { queryClient } from '../api/queryClient'
import { fetchCollection } from '../api/restClient'
import type { Board, ImageEntry } from '../schema/board'
import type { BoardMeta } from '../schema/boardMeta'
import { ROOT_BOARD_ID } from '../schema/boardMeta'
import type { Edge } from '../schema/edge'
import type { ImageCard, Node } from '../schema/node'
import {
  accessModeAtom,
  type NetworkConfig,
  networkConfigAtom,
} from './atoms/networkSettings'
import { boardHistoryAtom, currentBoardAtom } from './history/boardHistoryAtom'
import { createHistoryState } from './history/reducer'
import { loadBoard } from './persistence/storage'
import { reapEntities } from './reaper'

/** Every board id whose own nodes/edges/images have been loaded in this network session (design doc §6b/§6c) — reset on every mode switch. Not read outside this module — `ensureBoardLoaded`'s own no-op check and `initializeNetworkMode`/`switchToLocalMode`'s resets are the only readers/writers. */
const loadedBoardIdsAtom = atom<Set<string>>(new Set<string>())

/** True while the blocking home-board load (design doc §6a) is in flight — drives the settings modal's own "Connecting…" state. */
export const networkHomeLoadingAtom = atom(false)

/** A non-blocking read-path failure (design doc §7) — `retry` re-attempts exactly the load that failed. `undefined` when there's nothing to report. Not read outside this module — `networkLoadErrorAtom`'s own inferred type is all a consumer needs. */
interface NetworkLoadError {
  message: string
  retry: () => void
}
export const networkLoadErrorAtom = atom<NetworkLoadError | undefined>(
  undefined,
)

interface BoardContent {
  nodes: Node[]
  edges: Edge[]
  images: ImageEntry[]
}

function boardContentQueryKey(boardId: string) {
  return ['network', 'board-content', boardId] as const
}

/** All images referenced by any `kind: 'image'` node in `nodes` — json-server's `id:in` filter fetches exactly these, never the whole `images` collection. */
async function fetchReferencedImages(
  config: NetworkConfig,
  nodes: readonly Node[],
): Promise<ImageEntry[]> {
  const imageIds = [
    ...new Set(
      nodes
        .filter(
          (node): node is ImageCard =>
            node.type === 'card' && node.kind === 'image',
        )
        .map((node) => node.imageId),
    ),
  ]
  if (imageIds.length === 0) return []
  return fetchCollection<ImageEntry>(config, 'images', {
    'id:in': imageIds.join(','),
  })
}

async function fetchBoardContent(
  config: NetworkConfig,
  boardId: string,
): Promise<BoardContent> {
  const [nodes, edges] = await Promise.all([
    fetchCollection<Node>(config, 'nodes', { boardId }),
    fetchCollection<Edge>(config, 'edges', { boardId }),
  ])
  const images = await fetchReferencedImages(config, nodes)
  return { nodes, edges, images }
}

/** Exported for direct unit testing — see networkBoardLoader.test.ts. Merges freshly-fetched content into the live document, deduping anything already resident by id (so a redundant re-fetch of an already-loaded board is harmless). */
export function mergeBoardContent(board: Board, content: BoardContent): Board {
  const nodeIds = new Set(board.nodes.map((n) => n.id))
  const edgeIds = new Set(board.edges.map((e) => e.id))
  const imageIds = new Set(board.images.map((i) => i.id))
  return {
    ...board,
    nodes: [...board.nodes, ...content.nodes.filter((n) => !nodeIds.has(n.id))],
    edges: [...board.edges, ...content.edges.filter((e) => !edgeIds.has(e.id))],
    images: [
      ...board.images,
      ...content.images.filter((i) => !imageIds.has(i.id)),
    ],
  }
}

/**
 * Ensures `boardId`'s own nodes/edges/images are loaded (network mode
 * only — a no-op in local mode, where everything is already resident).
 * Safe to call redundantly: TanStack Query's `fetchQuery` de-dupes
 * concurrent callers and serves a repeat call from cache, so both the
 * background eager-load (§6b) and a direct navigation (§6c) can call this
 * for the same board without double-fetching. A navigation calling this
 * for a board the eager-load hasn't reached yet is exactly how "jump to
 * top priority" (design doc §10) falls out for free — there's no separate
 * queue to reorder, just whichever caller asks first.
 */
export async function ensureBoardLoaded(boardId: string): Promise<void> {
  const store = getDefaultStore()
  if (store.get(accessModeAtom) !== 'network') return
  if (store.get(loadedBoardIdsAtom).has(boardId)) return
  const config = store.get(networkConfigAtom)
  try {
    const content = await queryClient.fetchQuery({
      queryKey: boardContentQueryKey(boardId),
      queryFn: () => fetchBoardContent(config, boardId),
    })
    // Re-check mode after the await — a mode switch back to local while
    // this was in flight must not merge network data into what's now the
    // local document (design doc §1's "ships in the night").
    if (store.get(accessModeAtom) !== 'network') return
    store.set(currentBoardAtom, (current) =>
      mergeBoardContent(current, content),
    )
    store.set(
      loadedBoardIdsAtom,
      (ids: Set<string>) => new Set([...ids, boardId]),
    )
  } catch (error) {
    store.set(networkLoadErrorAtom, {
      message: `Couldn't load that board from the network — ${(error as Error).message}`,
      retry: () => {
        queryClient.removeQueries({ queryKey: boardContentQueryKey(boardId) })
        void ensureBoardLoaded(boardId)
      },
    })
    throw error
  }
}

/** Sequential background eager-load of every board besides the home board (design doc §6b/§10 — "sequential" was the developer's explicit call on the open question). */
async function eagerLoadOtherBoards(
  boardIds: readonly string[],
): Promise<void> {
  for (const boardId of boardIds) {
    try {
      await ensureBoardLoaded(boardId)
    } catch {
      // Already surfaced via networkLoadErrorAtom inside ensureBoardLoaded
      // — keep eager-loading the rest rather than aborting the whole
      // background pass over one board's failure.
    }
  }
}

/**
 * The blocking home-board load (design doc §6a) — fetches every `boards`
 * entry plus the root board's own nodes/edges/images, replacing whatever
 * document (local or a previous network session's) was live, then kicks
 * off the non-blocking background eager-load of every other board (§6b).
 * Called once, by the settings modal's Confirm handler, right after its
 * connection test succeeds (network mode design doc §2).
 */
export async function initializeNetworkMode(
  config: NetworkConfig,
): Promise<void> {
  const store = getDefaultStore()
  store.set(networkHomeLoadingAtom, true)
  store.set(networkLoadErrorAtom, undefined)
  // A fresh session against (possibly) a different backend — any id this
  // app previously learned from a server response no longer applies (see
  // api/networkOps.ts's module comment).
  resetIdRemapTable()
  try {
    const boards = await queryClient.fetchQuery({
      queryKey: ['network', 'boards'] as const,
      queryFn: () => fetchCollection<BoardMeta>(config, 'boards'),
    })
    const rootContent = await queryClient.fetchQuery({
      queryKey: boardContentQueryKey(ROOT_BOARD_ID),
      queryFn: () => fetchBoardContent(config, ROOT_BOARD_ID),
    })
    store.set(currentBoardAtom, (board) => ({
      ...board,
      boards,
      nodes: rootContent.nodes,
      edges: rootContent.edges,
      images: rootContent.images,
    }))
    store.set(
      boardHistoryAtom,
      createHistoryState({ ops: [], boardId: ROOT_BOARD_ID }),
    )
    store.set(loadedBoardIdsAtom, new Set([ROOT_BOARD_ID]))
    void eagerLoadOtherBoards(
      boards.map((b) => b.id).filter((id) => id !== ROOT_BOARD_ID),
    )
  } catch (error) {
    store.set(networkLoadErrorAtom, {
      message: `Couldn't load boards from the network — ${(error as Error).message}`,
      retry: () => {
        queryClient.removeQueries({ queryKey: ['network', 'boards'] })
        queryClient.removeQueries({
          queryKey: boardContentQueryKey(ROOT_BOARD_ID),
        })
        void initializeNetworkMode(config)
      },
    })
    throw error
  } finally {
    store.set(networkHomeLoadingAtom, false)
  }
}

/**
 * Switching back to Local mode (network mode design doc §1's "ships in the
 * night") — reloads whatever's actually in localStorage (untouched this
 * whole network session, since network-mode saves never call
 * `writeBoard`) rather than leaving the just-departed network document
 * live, and drops every network-only tracking atom back to its rest state.
 */
export function switchToLocalMode(): void {
  const store = getDefaultStore()
  const loadResult = loadBoard()
  const board = reapEntities(loadResult.board, Date.now())
  store.set(currentBoardAtom, board)
  store.set(
    boardHistoryAtom,
    createHistoryState({ ops: [], boardId: ROOT_BOARD_ID }),
  )
  store.set(loadedBoardIdsAtom, new Set())
  store.set(networkLoadErrorAtom, undefined)
  resetIdRemapTable()
}
