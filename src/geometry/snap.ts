// Phase 6 stub — signatures only, per ctx/notes/260915-kanvy-spec.md §4.4.
// Phase 7 Stage 3 fills in the real logic (see
// ctx/notes/260915-prototype-migration-phase5-implementation-plan.md).

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Dot-matrix grid pitch (spec §3). */
export const GRID_SIZE = 16

/** Y-axis snap activates within this many px of a neighbor's edge (spec §4.4: 2 grid cells). */
export const Y_SNAP_THRESHOLD = GRID_SIZE * 2

/** Fixed gutter gap the Y-axis snaps to (spec §4.4: 1 grid cell). */
export const Y_SNAP_GUTTER = GRID_SIZE

/**
 * Snaps a single coordinate to the nearest grid *midpoint* — i.e. a value
 * congruent to `gridSize / 2` (mod `gridSize`), so geometry lands in the
 * gaps between grid dots rather than on them (spec §3).
 */
export function snapToGridMidpoint(
  _value: number,
  _gridSize: number = GRID_SIZE,
): number {
  throw new Error('not implemented — phase 7')
}

/**
 * Resolves the Y position for a candidate drop: snaps to a fixed gutter
 * from a column-overlapping neighbor's top/bottom edge when within
 * `Y_SNAP_THRESHOLD`, otherwise returns the candidate's own Y unchanged
 * (the Y-axis does not follow the grid — spec §4.4).
 */
export function snapY(_candidate: Rect, _neighbors: readonly Rect[]): number {
  throw new Error('not implemented — phase 7')
}
