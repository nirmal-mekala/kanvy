// Pure rect geometry underlying spatial ("sticky") container membership —
// per ctx/notes/260915-kanvy-spec.md §2.3 (v0.1: membership is re-derived
// from x/y/w/h, not stored). See containers/containment.ts for how these
// combine into drag-carry and render-order decisions.

import type { Rect } from './snap'

/** Overlap area in px² between two rects (0 when they don't overlap). */
export function overlapArea(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (width <= 0 || height <= 0) return 0
  return width * height
}

/**
 * Whether `outer` fully contains `inner` (edges may touch). Ported from the
 * prototype's `fullyEncloses` (Board.jsx's `getContainedOrigins`) — the
 * asymmetry-correction a plain overlap test needs: an ancestor container
 * "overlaps" a descendant just as much as the descendant overlaps it, so
 * this is what tells the two apart (only a descendant should ever be
 * carried along when its ancestor is dragged, never the reverse).
 */
export function fullyEncloses(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
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
