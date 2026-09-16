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
import type { Node } from '../schema/node'
import { computePasteOffset } from './pasteOffset'

interface ClipboardState {
  nodes: readonly Node[]
  pasteCount: number
}

/** `null` when nothing's been copied yet this session. Not exported — only read/written via the two actions below. */
const nodeClipboardAtom = atom<ClipboardState | null>(null)

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

/** Returns `withoutParent`-ed, freshly-id'd, offset copies of the clipboard's nodes, or `[]` if nothing's copied. */
export const pasteFromNodeClipboardAtom = atom(
  null,
  (get, set, containers: readonly Rect[]): Node[] => {
    const clip = get(nodeClipboardAtom)
    if (!clip || clip.nodes.length === 0) return []

    // The prototype increments its paste count *before* computing the
    // staircase offset (Board.jsx's `pasteClipboard`), so the very first
    // paste already lands one step off the original instead of exactly on
    // top of it.
    const pasteCount = clip.pasteCount + 1
    const offset = computePasteOffset(
      pasteCount,
      boundingBox(clip.nodes),
      containers,
    )
    set(nodeClipboardAtom, { ...clip, pasteCount })

    const now = new Date().toISOString()
    return clip.nodes.map((node) => {
      // Paste always lands outside of every existing container (spec
      // §2.3/§7) — group membership is formal-child-on-drop only, and paste
      // never triggers a drop, so no pasted node keeps a `parentId`.
      const { parentId: _parentId, ...withoutParent } = node
      return {
        ...withoutParent,
        id: generateId(),
        x: node.x + offset,
        y: node.y + offset,
        createdAt: now,
        updatedAt: now,
      } as Node
    })
  },
)
