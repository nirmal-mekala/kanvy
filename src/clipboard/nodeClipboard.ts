// In-app node clipboard (spec §7) — cards/containers as structured data,
// in-memory only (never synced to the OS clipboard). Edges between copied
// nodes are NOT carried over on copy/paste — an existing limitation,
// preserved as-is, not fixed. Populated by ⌘/Ctrl+C, consumed by ⌘/Ctrl+V
// (see useClipboardShortcuts.ts for the full OS-clipboard priority order
// this sits inside).

import { atom } from 'jotai'
import { boundingBox } from '../geometry/containment'
import type { Rect } from '../geometry/snap'
import { generateId } from '../schema/legacy'
import type { BoardCard, Node } from '../schema/node'
import { computePasteOffset } from './pasteOffset'

interface ClipboardState {
  nodes: readonly Node[]
  pasteCount: number
}

/** `null` when nothing's been copied yet this session. Not exported — only read/written via the two actions below. */
const nodeClipboardAtom = atom<ClipboardState | null>(null)

/**
 * Whether the in-app node clipboard currently has anything to paste — read
 * by both paste-handling hooks so a populated clipboard (a deliberate,
 * just-performed ⌘/Ctrl+C) takes priority over incidental OS-clipboard
 * content (an unrelated image/URL sitting there from outside the app),
 * rather than the OS-clipboard branches silently winning every time.
 */
export const hasNodeClipboardContentAtom = atom((get) => {
  const clip = get(nodeClipboardAtom)
  return !!clip && clip.nodes.length > 0
})

/**
 * A read-only peek at what's currently copied — used to decide, *before*
 * actually pasting, whether the clipboard contains any `board`-kind nodes
 * and so needs the confirm modal gate (multiboard support design doc §4)
 * ahead of `pasteFromNodeClipboardAtom` itself, which mutates the
 * clipboard's paste-count/staircase state as a side effect and so can't
 * safely be called just to check.
 */
export const nodeClipboardContentsAtom = atom(
  (get) => get(nodeClipboardAtom)?.nodes ?? [],
)

/** Copies `nodes` (a snapshot, not a live reference) — returns `false` (a no-op) if `nodes` is empty. */
export const copyToNodeClipboardAtom = atom(
  null,
  (_get, set, nodes: readonly Node[]): boolean => {
    if (nodes.length === 0) return false
    set(nodeClipboardAtom, {
      nodes: nodes.map((node) => ({ ...node })),
      pasteCount: 0,
    })
    return true
  },
)

// fallow-ignore-next-line unused-type
export interface PasteFromNodeClipboardResult {
  /** Freshly-id'd, offset copies of every non-board copied node. */
  pastedNodes: Node[]
  /**
   * The *original* (uncopied) board-kind nodes from the clipboard, if
   * any — a shallow copy-then-offset is wrong for these (multiboard
   * support design doc §2: a board node can't be duplicated by just
   * giving it a fresh id, since two board nodes can never share one
   * `boards` entry). The caller passes these straight to
   * `duplicateBoardNodesAtom` along with `offset`, so the deep-copied
   * board(s) land displaced by the same amount as `pastedNodes`.
   */
  boardNodes: BoardCard[]
  /** The uniform offset applied to `pastedNodes` — reused for `boardNodes` so a mixed paste displaces as one visual unit. */
  offset: number
}

/**
 * Freshly-id'd, offset copies of the clipboard's non-board nodes (`[]` if
 * nothing's copied or everything copied was a board node). One uniform
 * offset is applied to every copied node (not a per-node recompute),
 * which preserves relative positions — and so, with no stored ownership
 * field to worry about, spatial containment relationships *within* the
 * copied set survive automatically (spec §2.3/§7, v0.1). Since the whole
 * set always lands clear of every existing container (`computePasteOffset`'s
 * push-until-clear loop), a paste never gets spatially adopted by
 * something that was already on the board.
 */
export const pasteFromNodeClipboardAtom = atom(
  null,
  (get, set, containers: readonly Rect[]): PasteFromNodeClipboardResult => {
    const empty: PasteFromNodeClipboardResult = {
      pastedNodes: [],
      boardNodes: [],
      offset: 0,
    }
    const clip = get(nodeClipboardAtom)
    if (!clip || clip.nodes.length === 0) return empty

    // The prototype increments its paste count *before* computing the
    // staircase offset (Board.jsx's `pasteClipboard`), so the very first
    // paste already lands one step off the original instead of exactly on
    // top of it. Computed over the *whole* copied set (board nodes
    // included) so the staircase/push-out behavior is identical to before
    // multiboard support split board nodes out of the copy loop below.
    const pasteCount = clip.pasteCount + 1
    const offset = computePasteOffset(
      pasteCount,
      boundingBox(clip.nodes),
      containers,
    )
    set(nodeClipboardAtom, { ...clip, pasteCount })

    const now = new Date().toISOString()
    const boardNodes: BoardCard[] = []
    const pastedNodes: Node[] = []
    for (const node of clip.nodes) {
      if (node.type === 'card' && node.kind === 'board') {
        boardNodes.push(node)
        continue
      }
      pastedNodes.push({
        ...node,
        id: generateId(),
        x: node.x + offset,
        y: node.y + offset,
        createdAt: now,
        updatedAt: now,
      })
    }
    return { pastedNodes, boardNodes, offset }
  },
)
