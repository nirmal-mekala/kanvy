// Board-level image blob map (spec §2.6). No read atom here yet — nothing
// consumes `board.images` until a card actually renders one (Stage 4), at
// which point it can read straight off `boardAtom` (or gain a dedicated
// derived atom if per-image granularity turns out to matter); adding one
// pre-emptively now would just be an unused export until then.

import type { ImageCard, Node } from '../../schema/node'

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
