// Phase 6 stub — signatures only, per ctx/notes/260915-kanvy-spec.md §2.3.
// Phase 7 Stage 5 fills in the real logic (containers/ parentId assignment).

import type { Rect } from './snap'

export interface IdentifiedRect extends Rect {
  id: string
}

/** Overlap area in px² between two rects (0 when they don't overlap). */
export function overlapArea(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (width <= 0 || height <= 0) return 0
  return width * height
}

/**
 * Which container `node` should become a child of on drop — the container
 * it overlaps *most* by area, or `undefined` if it overlaps none (spec §2.3).
 */
export function findParentByLargestOverlap(
  node: Rect,
  containers: readonly IdentifiedRect[],
): string | undefined {
  let bestId: string | undefined
  let bestArea = 0
  for (const container of containers) {
    const area = overlapArea(node, container)
    if (area > bestArea) {
      bestArea = area
      bestId = container.id
    }
  }
  return bestId
}

/** The smallest rect enclosing every rect in `rects`. Throws on an empty array. */
export function boundingBox(rects: readonly Rect[]): Rect {
  if (rects.length === 0) {
    throw new Error(
      'boundingBox: cannot compute bounding box of an empty array',
    )
  }
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const rect of rects) {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.w)
    maxY = Math.max(maxY, rect.y + rect.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}
