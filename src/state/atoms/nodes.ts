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

import { atom } from 'jotai'
import {
  BIG_TEXT_DEFAULT_H,
  BIG_TEXT_DEFAULT_W,
  CARD_WIDTH,
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
} from '../../schema/node'
import { boardAtom, updateBoardAtom } from '../history/boardHistoryAtom'
import { atomFamily } from './atomFamily'
import { pruneOrphanedImages } from './images'

/**
 * Fields common to every node kind (position/size, accent color, container
 * membership, task status). Kind-specific fields (`content`, `size`,
 * `imageId`, `link`, `pattern`) aren't patchable here — `keyof Node` for the
 * CardNode/ContainerNode union only includes what's common to all variants
 * anyway, and kind-specific edits (a card's caption, a kind conversion) get
 * their own actions in a later stage (cards/, Stage 6) rather than a loose
 * generic patch.
 */
interface NodeCommonPatch {
  x?: number
  y?: number
  w?: number
  h?: number
  color?: ColorKey
  parentId?: NodeId
  task?: { status: TaskStatus }
}

export const nodeIdsAtom = atom((get) =>
  get(boardAtom).nodes.map((node) => node.id),
)

export const nodeFamily = atomFamily((id: NodeId) =>
  atom((get) => get(boardAtom).nodes.find((node) => node.id === id)),
)

function nowISO(): string {
  return new Date().toISOString()
}

/** Returns `node` with `parentId` removed entirely (not set to `undefined` — exactOptionalPropertyTypes). */
function withoutParent(node: Node): Node {
  const { parentId: _parentId, ...rest } = node
  return rest as Node
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
  (_get, set, node: Node, newImage?: { id: string; dataUri: string }) => {
    set(updateBoardAtom, (board: Board) => ({
      ...board,
      nodes: [...board.nodes, node],
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
export const addNodesAtom = atom(null, (_get, set, nodes: readonly Node[]) => {
  if (nodes.length === 0) return
  set(updateBoardAtom, (board: Board) => ({
    ...board,
    nodes: [...board.nodes, ...nodes],
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
    _get,
    set,
    id: NodeId,
    next: Node,
    newImage?: { id: string; dataUri: string },
  ) => {
    set(updateBoardAtom, (board: Board) => {
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
  (_get, set, id: NodeId, content: string) => {
    const now = nowISO()
    set(updateBoardAtom, (board: Board) => {
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
 * Shallow-patches one node by id and refreshes `updatedAt` — a move with no
 * content change still counts as a touch (spec §2.7, an intentional wart).
 * No-ops (unknown id) leave the board reference unchanged so the history
 * reducer's no-op check drops it rather than recording an empty step.
 */
export const updateNodeAtom = atom(
  null,
  (_get, set, id: NodeId, patch: NodeCommonPatch) => {
    const now = nowISO()
    set(updateBoardAtom, (board: Board) => {
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
  (_get, set, moves: readonly { id: NodeId; x: number; y: number }[]) => {
    if (moves.length === 0) return
    const now = nowISO()
    const byId = new Map(moves.map((move) => [move.id, move]))
    set(updateBoardAtom, (board: Board) => {
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
 * Sets or clears `parentId` for one node (drop-by-largest-overlap
 * assignment, spec §2.3) — a dedicated action rather than folding into
 * `updateNodeAtom`'s patch, since clearing a parent means removing the
 * field entirely (`exactOptionalPropertyTypes`), not patching it to
 * `undefined`.
 */
export const setParentIdAtom = atom(
  null,
  (_get, set, id: NodeId, parentId: NodeId | undefined) => {
    const now = nowISO()
    set(updateBoardAtom, (board: Board) => {
      let changed = false
      const nodes = board.nodes.map((node) => {
        if (node.id !== id || node.parentId === parentId) return node
        changed = true
        const next = parentId === undefined ? withoutParent(node) : node
        return {
          ...next,
          ...(parentId !== undefined ? { parentId } : {}),
          updatedAt: now,
        }
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
  (_get, set, id: NodeId, patch: Partial<LinkCard['link']>) => {
    const now = nowISO()
    set(updateBoardAtom, (board: Board) => {
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

/** Reorders `nodes` to match `orderedIds` exactly (array order doubles as z-index — phase2 schema §1). */
export const reorderNodesAtom = atom(
  null,
  (_get, set, orderedIds: readonly NodeId[]) => {
    set(updateBoardAtom, (board: Board) => {
      const byId = new Map(board.nodes.map((node) => [node.id, node]))
      const nodes = orderedIds
        .map((id) => byId.get(id))
        .filter((node): node is Node => node !== undefined)
      return nodes.length === board.nodes.length ? { ...board, nodes } : board
    })
  },
)

/**
 * Removes a mixed set of node/edge ids in one step (spec §4.2's
 * Backspace/Delete). Deleting a container does not cascade-delete its
 * descendants — matching the prototype's `removeItems`
 * (ctx/support/260915-prototype-source/src/state/useBoard.js) — but a
 * surviving child's now-dangling `parentId` is cleared so it isn't left
 * referencing a deleted node. Also drops any edge touching a removed node
 * and prunes orphaned images (spec §2.6). Records the removed ids as the
 * undo step's `restoreSelection` (spec §8/Q11).
 */
export const removeEntitiesAtom = atom(
  null,
  (_get, set, ids: readonly string[]) => {
    const idSet = new Set(ids)
    set(
      updateBoardAtom,
      (board: Board) => {
        const nodes = board.nodes
          .filter((node) => !idSet.has(node.id))
          .map((node) =>
            node.parentId && idSet.has(node.parentId)
              ? withoutParent(node)
              : node,
          )
        const edges = board.edges.filter(
          (edge) =>
            !idSet.has(edge.id) &&
            !idSet.has(edge.fromNodeId) &&
            !idSet.has(edge.toNodeId),
        )
        const images = pruneOrphanedImages(nodes, board.images)
        return { ...board, nodes, edges, images }
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
  set: (
    write: typeof updateBoardAtom,
    updater: (board: Board) => Board,
  ) => void,
  ids: readonly NodeId[],
  skip: (node: Node) => boolean,
  patch: (node: Node, now: string) => Node,
) {
  if (ids.length === 0) return
  const idSet = new Set(ids)
  const now = nowISO()
  set(updateBoardAtom, (board: Board) => {
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
  (_get, set, ids: readonly NodeId[], color: ColorKey) => {
    patchSelectedNodes(
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
  (_get, set, ids: readonly NodeId[], pattern: PatternKey) => {
    patchSelectedNodes(
      set,
      ids,
      (node) => node.type !== 'container' || node.pattern === pattern,
      // `skip` already guarantees `type === 'container'` here.
      (node, now) => ({ ...(node as ContainerNode), pattern, updatedAt: now }),
    )
  },
)

/**
 * Toggles `size` on every selected `kind: 'text'` card (spec §5.2) — any
 * image/link card in `ids` is left untouched (they're never `'big'`).
 * Switching to `'big'` seeds a fixed default box; switching back to
 * `'regular'` only resets `w` — `h` is left for the card's own auto-grow
 * measurement (spec §2.4) to correct on its next render, matching how a
 * freshly-created regular card's height is established.
 */
export const setTextSizeAtom = atom(
  null,
  (_get, set, ids: readonly NodeId[], size: 'regular' | 'big') => {
    patchSelectedNodes(
      set,
      ids,
      (node) =>
        node.type !== 'card' || node.kind !== 'text' || node.size === size,
      (node, now) => {
        // `skip` already guarantees `type === 'card', kind === 'text'` here.
        const card = node as TextCard
        return size === 'big'
          ? {
              ...card,
              size,
              w: BIG_TEXT_DEFAULT_W,
              h: BIG_TEXT_DEFAULT_H,
              updatedAt: now,
            }
          : { ...card, size, w: CARD_WIDTH, updatedAt: now }
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
  (_get, set, ids: readonly NodeId[], kind: 'default' | 'task') => {
    patchSelectedNodes(
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
  (_get, set, ids: readonly NodeId[], status: TaskStatus) => {
    patchSelectedNodes(
      set,
      ids,
      (node) => !node.task || node.task.status === status,
      (node, now) => ({ ...node, task: { status }, updatedAt: now }),
    )
  },
)
