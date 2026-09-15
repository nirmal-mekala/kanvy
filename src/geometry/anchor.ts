// Phase 6 stub — signatures only, per ctx/notes/260915-kanvy-spec.md §4.6.
// Phase 7 Stage 6 fills in the real logic.

import type { Rect } from './snap'

export type Side = 'top' | 'right' | 'bottom' | 'left'

export interface Point {
  x: number
  y: number
}

/**
 * Which side of `rect` a hover/drop `point` should pick — a generous hit
 * area covering the whole general area of a side, not just a small
 * connector dot (spec §4.6).
 */
export function pickSide(point: Point, rect: Rect): Side {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const dx = (point.x - cx) / rect.w
  const dy = (point.y - cy) / rect.h
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left'
  }
  return dy >= 0 ? 'bottom' : 'top'
}

/** The midpoint of the given side of `rect`. */
export function anchorPoint(rect: Rect, side: Side): Point {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  switch (side) {
    case 'top':
      return { x: cx, y: rect.y }
    case 'bottom':
      return { x: cx, y: rect.y + rect.h }
    case 'left':
      return { x: rect.x, y: cy }
    case 'right':
      return { x: rect.x + rect.w, y: cy }
  }
}
