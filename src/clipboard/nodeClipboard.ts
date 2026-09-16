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

/**
 * Freshly-id'd, offset copies of the clipboard's nodes, or `[]` if
 * nothing's copied. One uniform offset is applied to every copied node
 * (not a per-node recompute), which preserves relative positions — and so,
 * with no stored ownership field to worry about, spatial containment
 * relationships *within* the copied set survive automatically (spec
 * §2.3/§7, v0.1). Since the whole set always lands clear of every existing
 * container (`computePasteOffset`'s push-until-clear loop), a paste never
 * gets spatially adopted by something that was already on the board.
 */
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
    const idMap = new Map(clip.nodes.map((node) => [node.id, generateId()]))

    return clip.nodes.map((node) => ({
      ...node,
      id: idMap.get(node.id) as string,
      x: node.x + offset,
      y: node.y + offset,
      createdAt: now,
      updatedAt: now,
    }))
  },
)
