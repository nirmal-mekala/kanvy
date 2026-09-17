// Extracted out of state/atoms/images.ts (a pure function, no jotai/atom
// dependency) so both it and state/reaper.ts can import it without a
// circular dependency: images.ts's own `imagesAtom` needs
// state/history/boardHistoryAtom.ts's `boardAtom`, and boardHistoryAtom.ts
// needs reaper.ts — if reaper.ts imported this straight from images.ts,
// that would close the cycle back through images.ts's own import of
// boardHistoryAtom.ts.

import type { ImageCard, Node } from '../schema/node'

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
