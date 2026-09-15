// Phase 6 stub — signatures only, per ctx/notes/260915-kanvy-spec.md §4.4.
// Phase 7 Stage 5 fills in the real logic.

import { GRID_SIZE, type Rect } from './snap'

/** Clearance above/below a container's drag-handle band (spec §4.4: 1 grid cell). */
export const NO_FLY_CLEARANCE = GRID_SIZE

/**
 * True when `candidate` straddles a container's top-edge drag-handle band
 * (the handle itself, plus `NO_FLY_CLEARANCE` above and below) — it may
 * still be fully inside (below the zone) or fully above the container.
 */
export function isInNoFlyZone(
  _candidate: Rect,
  _container: Rect,
  _handleHeight: number,
): boolean {
  throw new Error('not implemented — phase 7')
}

/**
 * Pushes `candidate` out of the no-fly zone (to whichever side — fully
 * above the container, or fully inside past the handle band — requires
 * less vertical movement), leaving it unchanged if it isn't in the zone.
 */
export function clampOutOfNoFlyZone(
  _candidate: Rect,
  _container: Rect,
  _handleHeight: number,
): Rect {
  throw new Error('not implemented — phase 7')
}
