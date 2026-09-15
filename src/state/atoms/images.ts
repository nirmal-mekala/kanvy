// Board-level image blob map (spec §2.6).

import { atom } from 'jotai'
import type { ImageCard, Node } from '../../schema/node'
import { boardAtom } from '../history/boardHistoryAtom'

/** The board's image blob map, keyed by generated id (spec §2.6). */
export const imagesAtom = atom((get) => get(boardAtom).images)

/**
 * Drops any `images` entry no remaining node's `imageId` references (spec
 * §2.6) — called after any mutation that could leave one behind (a node
 * deleted, or converted away from `kind: 'image'`). Returns the original
 * `images` reference unchanged when nothing was pruned, so callers can
 * still bail out of a board update on an unrelated no-op.
 */
export function pruneOrphanedImages(
  nodes: readonly Node[],
  images: Record<string, string>,
): Record<string, string> {
  const used = new Set(
    nodes
      .filter(
        (node): node is ImageCard =>
          node.type === 'card' && node.kind === 'image',
      )
      .map((node) => node.imageId),
  )
  const kept = Object.fromEntries(
    Object.entries(images).filter(([id]) => used.has(id)),
  )
  return Object.keys(kept).length === Object.keys(images).length ? images : kept
}
