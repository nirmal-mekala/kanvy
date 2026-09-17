// Granular per-node read access + node-affecting board operations. Rather
// than a primitive jotai-family atomFamily synced to the Board (the
// package that ships that in jotai v3 isn't one of the phase3-decided
// dependencies — see ./atomFamily.ts), `nodeFamily(id)` is a *derived* read
// atom over the single history-tracked `boardAtom`. As long as mutations
// below replace only the touched node's object (never rebuild the whole
// `nodes` array's entries), an unrelated node's derived atom keeps the same
// object reference and jotai's default equality check skips notifying its
// subscribers — the "whole canvas re-renders on one drag" problem phase3's
// stack decision (AGENTS.md) called out, solved without a second
// synchronized copy of node state to keep consistent with undo/redo.
//
// Multiboard support (ctx/notes/260917-multiboard-support-design.md §2):
// `nodes` is a single flat array shared across all boards. `nodeIdsAtom`
// scopes itself to `currentBoardIdAtom`; every mutation below is
// attributed to the current board for undo/redo purposes (see
// state/history/boardHistoryAtom.ts), and the two that create brand-new
// nodes (`addNodeAtom`/`addNodesAtom`) additionally stamp the new node's
// `boardId` to the current board, overriding whatever placeholder value
// the caller's factory happened to construct it with.

import { atom } from 'jotai'
import {
  CARD_WIDTH,
  HEADING_DEFAULT_H,
  HEADING_DEFAULT_W,
} from '../../geometry/constants'
import type { Board } from '../../schema/board'
import type {
  ColorKey,
  ContainerNode,
  LinkCard,
  Node,
  NodeId,
  PatternKey,
  TaskStatus,
  TextCard,
  TextSize,
} from '../../schema/node'
import { boardAtom, updateBoardAtom } from '../history/boardHistoryAtom'
import { atomFamily } from './atomFamily'
import { currentBoardIdAtom } from './currentBoard'
import { pruneOrphanedImages } from './images'

/**
 * Fields common to every node kind (position/size, accent color, task
 * status). Kind-specific fields (`content`, `size`, `imageId`, `link`,
 * `pattern`) aren't patchable here — `keyof Node` for the CardNode/
 * ContainerNode union only includes what's common to all variants anyway,
 * and kind-specific edits (a card's caption, a kind conversion) get their
 * own actions in a later stage (cards/, Stage 6) rather than a loose
 * generic patch. Container membership isn't a field at all (v0.1, spec
 * §2.3) — it's derived purely from x/y/w/h, so there's nothing to patch.
 */
interface NodeCommonPatch {
  x?: number
  y?: number
  w?: number
  h?: number
  color?: ColorKey
  task?: { status: TaskStatus }
}

export const nodeIdsAtom = atom((get) => {
  const currentBoardId = get(currentBoardIdAtom)
  return get(boardAtom)
    .nodes.filter((node) => node.boardId === currentBoardId)
    .map((node) => node.id)
})

export const nodeFamily = atomFamily((id: NodeId) =>
  atom((get) => get(boardAtom).nodes.find((node) => node.id === id)),
)

function nowISO(): string {
  return new Date().toISOString()
}

/** Returns `node` with `task` removed entirely (not set to `undefined` — exactOptionalPropertyTypes). */
function withoutTask(node: Node): Node {
  const { task: _task, ...rest } = node
  return rest as Node
}

/**
 * Appends a new, already fully constructed node (spec §5.1/§5.3/§5.4's
 * card factories, or §4.5's `createContainer`). `newImage`, when given,
 * adds the corresponding blob to the board's `images` map in the same
 * history step (spec §2.6) — used when the new node is a freshly created
 * image card.
 */
export const addNodeAtom = atom(
  null,
  (get, set, node: Node, newImage?: { id: string; dataUri: string }) => {
    const boardId = get(currentBoardIdAtom)
    const stamped = { ...node, boardId }
    set(updateBoardAtom, boardId, (board: Board) => ({
      ...board,
      nodes: [...board.nodes, stamped],
      images: newImage
        ? { ...board.images, [newImage.id]: newImage.dataUri }
        : board.images,
    }))
  },
)

/**
 * Appends several already fully constructed nodes in one history step (spec
 * §7's in-app clipboard paste and ⌘/Ctrl+D duplicate — both create more
 * than one node at once when the source selection was multi-node, and
 * should undo as a single step).
 */
export const addNodesAtom = atom(null, (get, set, nodes: readonly Node[]) => {
  if (nodes.length === 0) return
  const boardId = get(currentBoardIdAtom)
  const stamped = nodes.map((node) => ({ ...node, boardId }))
  set(updateBoardAtom, boardId, (board: Board) => ({
    ...board,
    nodes: [...board.nodes, ...stamped],
  }))
})

/**
 * Replaces one node with `next` wholesale (spec §2.2's kind-conversion —
 * text↔image↔link is a full object replacement, not a field patch, per
 * phase2 schema §2's notes). `newImage`, when given, adds the corresponding
 * blob to `images` in the same history step before pruning orphans, so a
 * conversion *to* `kind: 'image'` doesn't have its own fresh blob pruned as
 * unreferenced, and a conversion *away from* `kind: 'image'` correctly
 * frees the old one (spec §2.6).
 */
export const replaceNodeAtom = atom(
  null,
  (
    get,
    set,
    id: NodeId,
    next: Node,
    newImage?: { id: string; dataUri: string },
  ) => {
    set(updateBoardAtom, get(currentBoardIdAtom), (board: Board) => {
      let changed = false
      const nodes = board.nodes.map((node) => {
        if (node.id !== id) return node
        changed = true
        return next
      })
      if (!changed) return board
      const withNewImage = newImage
        ? { ...board.images, [newImage.id]: newImage.dataUri }
        : board.images
      return {
        ...board,
        nodes,
        images: pruneOrphanedImages(nodes, withNewImage),
      }
    })
  },
)

/**
 * Patches a card's caption text (spec §5's per-kind content editing) — kept
 * separate from `updateNodeAtom`'s common-field patch since `content` isn't
 * part of `NodeCommonPatch` (see its comment) and only ever applies to a
 * `type: 'card'` node.
 */
export const updateCardContentAtom = atom(
  null,
  (get, set, id: NodeId, content: string) => {
    const now = nowISO()
    set(updateBoardAtom, get(currentBoardIdAtom), (board: Board) => {
      let changed = false
      const nodes = board.nodes.map((node) => {
        if (node.id !== id || node.type !== 'card') return node
        changed = true
        return { ...node, content, updatedAt: now }
      })
      return changed ? { ...board, nodes } : board
    })
  },
)

/**
 * Syncs a regular card's rendered height into `h` (spec §2.4) — deliberately
 * *not* routed through `updateNodeAtom`: this fires from a `ResizeObserver`
 * whenever the DOM measurement differs from the stored value (including on
 * first mount, before anything has been touched), so treating it as a
 * `updatedAt`-refreshing "mutation" like §2.7's move-is-a-touch wart would
 * make recency mode's "fresh" reflect mere rendering, not anything the user
 * did.
 */
export const setNodeHeightAtom = atom(
  null,
  (get, set, id: NodeId, h: number) => {
    set(updateBoardAtom, get(currentBoardIdAtom), (board: Board) => {
      let changed = false
      const nodes = board.nodes.map((node) => {
        if (node.id !== id || node.h === h) return node
        changed = true
        return { ...node, h }
      })
      return changed ? { ...board, nodes } : board
    })
  },
)

/**
 * Shallow-patches one node by id and refreshes `updatedAt` — a move with no
 * content change still counts as a touch (spec §2.7, an intentional wart).
 * No-ops (unknown id) leave the board reference unchanged so the history
 * reducer's no-op check drops it rather than recording an empty step.
 */
export const updateNodeAtom = atom(
  null,
  (get, set, id: NodeId, patch: NodeCommonPatch) => {
    const now = nowISO()
    set(updateBoardAtom, get(currentBoardIdAtom), (board: Board) => {
      let changed = false
      const nodes = board.nodes.map((node) => {
        if (node.id !== id) return node
        changed = true
        return { ...node, ...patch, updatedAt: now } as Node
      })
      return changed ? { ...board, nodes } : board
    })
  },
)

/**
 * Repositions many nodes in one history step (spec §4.4 dragging a
 * multi-selection or a container's descendants) — every touched node
 * refreshes `updatedAt` together, matching a single user gesture.
 */
export const moveNodesAtom = atom(
  null,
  (get, set, moves: readonly { id: NodeId; x: number; y: number }[]) => {
    if (moves.length === 0) return
    const now = nowISO()
    const byId = new Map(moves.map((move) => [move.id, move]))
    set(updateBoardAtom, get(currentBoardIdAtom), (board: Board) => {
      let changed = false
      const nodes = board.nodes.map((node) => {
        const move = byId.get(node.id)
        if (!move) return node
        changed = true
        return { ...node, x: move.x, y: move.y, updatedAt: now }
      })
      return changed ? { ...board, nodes } : board
    })
  },
)

/**
 * Patches a link card's fetched-metadata fields once a `fetchLinkMetadata`
 * call (spec §5.4) resolves or fails — a no-op if the card was converted
 * away from `kind: 'link'` (or deleted) before the fetch settled.
 */
export const updateLinkAtom = atom(
  null,
  (get, set, id: NodeId, patch: Partial<LinkCard['link']>) => {
    const now = nowISO()
    set(updateBoardAtom, get(currentBoardIdAtom), (board: Board) => {
      let changed = false
      const nodes = board.nodes.map((node) => {
        if (node.id !== id || node.type !== 'card' || node.kind !== 'link')
          return node
        changed = true
        return { ...node, link: { ...node.link, ...patch }, updatedAt: now }
      })
      return changed ? { ...board, nodes } : board
    })
  },
)

/**
 * Reorders `nodes` to match `orderedIds` exactly (array order doubles as
 * z-index — phase2 schema §1). `orderedIds` is expected to be exactly the
 * current board's own node ids (a no-op otherwise) — only the *content* at
 * each of the current board's own array positions is permuted; the
 * positions themselves, and every other board's interleaved entries, are
 * left untouched.
 */
export const reorderNodesAtom = atom(
  null,
  (get, set, orderedIds: readonly NodeId[]) => {
    const currentBoardId = get(currentBoardIdAtom)
    set(updateBoardAtom, currentBoardId, (board: Board) => {
      const ownIds = new Set(
        board.nodes
          .filter((node) => node.boardId === currentBoardId)
          .map((node) => node.id),
      )
      if (
        orderedIds.length !== ownIds.size ||
        !orderedIds.every((id) => ownIds.has(id))
      ) {
        return board
      }
      const byId = new Map(board.nodes.map((node) => [node.id, node]))
      const queue = orderedIds
        .map((id) => byId.get(id))
        .filter((node): node is Node => node !== undefined)
      let cursor = 0
      const nodes = board.nodes.map((node) => {
        if (node.boardId !== currentBoardId) return node
        const next = queue[cursor]
        cursor += 1
        return next ?? node
      })
      return { ...board, nodes }
    })
  },
)

/**
 * Removes a mixed set of node/edge ids in one step (spec §4.2's
 * Backspace/Delete). Deleting a container does not cascade-delete its
 * descendants — matching the prototype's `removeItems`
 * (ctx/support/260915-prototype-source/src/state/useBoard.js) — and, with
 * no stored ownership field (v0.1, spec §2.3), there's nothing left
 * dangling to clean up on a survivor either. Also drops any edge touching a
 * removed node and prunes orphaned images (spec §2.6). Records the removed
 * ids as the undo step's `restoreSelection` (spec §8/Q11).
 *
 * Multiboard support (design doc §2/§4): any `kind: 'board'` node among
 * `ids` is a tombstone, not a real removal, for the board it references —
 * its own node still gets removed here like any other (it's just a
 * stand-in on the home board), but the *board* it points to is flipped to
 * `status: 'trashed'` rather than having its content actually deleted.
 * That content, and the reap that eventually frees it, are entirely
 * untouched by this action (see state/reaper.ts).
 */
export const removeEntitiesAtom = atom(
  null,
  (get, set, ids: readonly string[]) => {
    const idSet = new Set(ids)
    set(
      updateBoardAtom,
      get(currentBoardIdAtom),
      (board: Board) => {
        const now = nowISO()
        const trashedBoardIds = new Set(
          board.nodes
            .filter(
              (node): node is Node & { kind: 'board'; boardRef: string } =>
                idSet.has(node.id) &&
                node.type === 'card' &&
                node.kind === 'board',
            )
            .map((node) => node.boardRef),
        )
        const nodes = board.nodes.filter((node) => !idSet.has(node.id))
        const edges = board.edges.filter(
          (edge) =>
            !idSet.has(edge.id) &&
            !idSet.has(edge.fromNodeId) &&
            !idSet.has(edge.toNodeId),
        )
        const images = pruneOrphanedImages(nodes, board.images)
        const boards =
          trashedBoardIds.size === 0
            ? board.boards
            : board.boards.map((meta) =>
                trashedBoardIds.has(meta.id)
                  ? { ...meta, status: 'trashed' as const, updatedAt: now }
                  : meta,
              )
        return { ...board, nodes, edges, images, boards }
      },
      ids,
    )
  },
)

/**
 * Selection-menu bulk actions (Stage 8, spec §3/§5.2/§6.1) — each applies to
 * every id in `ids` in one history step (so a mixed-selection edit undoes as
 * one gesture). Shares one map-and-patch shape via `patchSelectedNodes`:
 * `skip` decides which of the matched ids a given action doesn't apply to
 * (e.g. `setPatternAtom` skips any selected card) so a caller can pass the
 * whole current selection without pre-filtering by node type/kind.
 */
function patchSelectedNodes(
  get: (a: typeof currentBoardIdAtom) => string,
  set: (
    write: typeof updateBoardAtom,
    boardId: string,
    updater: (board: Board) => Board,
  ) => void,
  ids: readonly NodeId[],
  skip: (node: Node) => boolean,
  patch: (node: Node, now: string) => Node,
) {
  if (ids.length === 0) return
  const idSet = new Set(ids)
  const now = nowISO()
  set(updateBoardAtom, get(currentBoardIdAtom), (board: Board) => {
    let changed = false
    const nodes = board.nodes.map((node) => {
      if (!idSet.has(node.id) || skip(node)) return node
      changed = true
      return patch(node, now)
    })
    return changed ? { ...board, nodes } : board
  })
}

export const setColorAtom = atom(
  null,
  (get, set, ids: readonly NodeId[], color: ColorKey) => {
    patchSelectedNodes(
      get,
      set,
      ids,
      (node) => node.color === color,
      (node, now) => ({ ...node, color, updatedAt: now }),
    )
  },
)

/** Pattern only applies to containers (spec §4.5) — any selected card is left untouched. */
export const setPatternAtom = atom(
  null,
  (get, set, ids: readonly NodeId[], pattern: PatternKey) => {
    patchSelectedNodes(
      get,
      set,
      ids,
      (node) => node.type !== 'container' || node.pattern === pattern,
      // `skip` already guarantees `type === 'container'` here.
      (node, now) => ({ ...(node as ContainerNode), pattern, updatedAt: now }),
    )
  },
)

/**
 * Sets `size` on every selected `kind: 'text'` card (spec §5.2) — any
 * image/link card in `ids` is left untouched (they never carry a `size`
 * at all). Three transition shapes:
 * - `'regular'` → a heading level (h1/h2/h3): seeds a fixed default box —
 *   a regular card's `w`/`h` aren't meaningful free-resize dimensions.
 * - a heading level → `'regular'`: only resets `w` — `h` is left for the
 *   card's own auto-grow measurement (spec §2.4) to correct on its next
 *   render, matching how a freshly-created regular card's height is
 *   established.
 * - one heading level → another (e.g. h1 → h2): both are already
 *   free-resize, so this only relabels `size` — whatever width/height the
 *   user already set stays as-is, it isn't reset to the toggle-on default.
 */
export const setTextSizeAtom = atom(
  null,
  (get, set, ids: readonly NodeId[], size: TextSize) => {
    patchSelectedNodes(
      get,
      set,
      ids,
      (node) =>
        node.type !== 'card' || node.kind !== 'text' || node.size === size,
      (node, now) => {
        // `skip` already guarantees `type === 'card', kind === 'text'` here.
        const card = node as TextCard
        const wasHeading = card.size !== 'regular'
        const becomingHeading = size !== 'regular'
        if (becomingHeading && !wasHeading) {
          return {
            ...card,
            size,
            w: HEADING_DEFAULT_W,
            h: HEADING_DEFAULT_H,
            updatedAt: now,
          }
        }
        if (!becomingHeading) {
          return { ...card, size, w: CARD_WIDTH, updatedAt: now }
        }
        return { ...card, size, updatedAt: now }
      },
    )
  },
)

/**
 * Default↔Task toggle (spec §6.1) — idempotent: switching an already-task
 * node to `'task'` again leaves its existing status alone (never resets to
 * `'todo'`), and switching a non-task node to `'default'` is a no-op.
 */
export const setTaskKindAtom = atom(
  null,
  (get, set, ids: readonly NodeId[], kind: 'default' | 'task') => {
    patchSelectedNodes(
      get,
      set,
      ids,
      (node) =>
        kind === 'task' ? node.task !== undefined : node.task === undefined,
      (node, now) =>
        kind === 'task'
          ? { ...node, task: { status: 'todo' as const }, updatedAt: now }
          : { ...withoutTask(node), updatedAt: now },
    )
  },
)

/** Status is only ever set via the selection menu (spec §6.1) — a no-op on any selected node that isn't already a task. */
export const setTaskStatusAtom = atom(
  null,
  (get, set, ids: readonly NodeId[], status: TaskStatus) => {
    patchSelectedNodes(
      get,
      set,
      ids,
      (node) => !node.task || node.task.status === status,
      (node, now) => ({ ...node, task: { status }, updatedAt: now }),
    )
  },
)
