// Phase 6 stub — signatures only, per ctx/notes/260915-kanvy-spec.md §2.3.
// Phase 7 Stage 5 fills in the real logic (containers/ parentId assignment).

import type { Rect } from './snap'

export interface IdentifiedRect extends Rect {
  id: string
}

/** Overlap area in px² between two rects (0 when they don't overlap). */
export function overlapArea(_a: Rect, _b: Rect): number {
  throw new Error('not implemented — phase 7')
}

/**
 * Which container `node` should become a child of on drop — the container
 * it overlaps *most* by area, or `undefined` if it overlaps none (spec §2.3).
 */
export function findParentByLargestOverlap(
  _node: Rect,
  _containers: readonly IdentifiedRect[],
): string | undefined {
  throw new Error('not implemented — phase 7')
}

/** The smallest rect enclosing every rect in `rects`. Throws on an empty array. */
export function boundingBox(_rects: readonly Rect[]): Rect {
  throw new Error('not implemented — phase 7')
}
