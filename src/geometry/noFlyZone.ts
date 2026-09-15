// Phase 6 stub — signatures only, per ctx/notes/260915-kanvy-spec.md §4.4.
// Phase 7 Stage 5 fills in the real logic.

import { GRID_SIZE, type Rect } from './snap'

/** Clearance above/below a container's drag-handle band (spec §4.4: 1 grid cell). */
export const NO_FLY_CLEARANCE = GRID_SIZE

function columnsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x
}

/**
 * True when `candidate` straddles a container's top-edge drag-handle band
 * (the handle itself, plus `NO_FLY_CLEARANCE` above and below) — it may
 * still be fully inside (below the zone) or fully above the container.
 */
export function isInNoFlyZone(
  candidate: Rect,
  container: Rect,
  handleHeight: number,
): boolean {
  if (!columnsOverlap(candidate, container)) return false
  const zoneAbove = container.y - NO_FLY_CLEARANCE
  const zoneBelow = container.y + handleHeight + NO_FLY_CLEARANCE
  return candidate.y < zoneBelow && candidate.y + candidate.h > zoneAbove
}

/**
 * Pushes `candidate` out of the no-fly zone (to whichever side — fully
 * above the container, or fully inside past the handle band — requires
 * less vertical movement), leaving it unchanged if it isn't in the zone.
 */
export function clampOutOfNoFlyZone(
  candidate: Rect,
  container: Rect,
  handleHeight: number,
): Rect {
  if (!isInNoFlyZone(candidate, container, handleHeight)) return candidate

  const zoneAbove = container.y - NO_FLY_CLEARANCE
  const zoneBelow = container.y + handleHeight + NO_FLY_CLEARANCE
  const moveUp = candidate.y + candidate.h - zoneAbove
  const moveDown = zoneBelow - candidate.y

  if (moveUp <= moveDown) {
    return { ...candidate, y: zoneAbove - candidate.h }
  }
  return { ...candidate, y: zoneBelow }
}
