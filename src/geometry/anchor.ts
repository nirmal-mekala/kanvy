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
export function pickSide(_point: Point, _rect: Rect): Side {
  throw new Error('not implemented — phase 7')
}

/** The midpoint of the given side of `rect`. */
export function anchorPoint(_rect: Rect, _side: Side): Point {
  throw new Error('not implemented — phase 7')
}
