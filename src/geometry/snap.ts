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
  value: number,
  gridSize: number = GRID_SIZE,
): number {
  const offset = gridSize / 2
  return Math.round((value - offset) / gridSize) * gridSize + offset
}

function columnsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x
}

/**
 * Resolves the Y position for a candidate drop: grid-snapped by default
 * (like X), but overridden by a fixed gutter from a column-overlapping
 * neighbor's top/bottom edge when one is within `Y_SNAP_THRESHOLD` — and
 * when *several* qualify, whichever candidate is actually closest to the
 * raw (pre-snap) Y wins, not just the first neighbor encountered. Ported
 * from the prototype's `Card.jsx` drag handler (`snapToGrid` default,
 * `bestDist` neighbor comparison). A qualifying neighbor's gutter always
 * wins over the grid snap — the grid is only used when no neighbor is
 * within threshold — so the ~1-grid-height band around a neighbor's edge
 * acts as a "no drop zone" that guides drags into equidistant gutters
 * regardless of the neighbor's height.
 */
export function snapY(candidate: Rect, neighbors: readonly Rect[]): number {
  let finalY = snapToGridMidpoint(candidate.y)
  // Seeded at `Infinity`, not the grid's own distance, so the grid never
  // competes with a qualifying neighbor gutter — it's only the fallback
  // when no neighbor is within `Y_SNAP_THRESHOLD` at all.
  let bestDist = Number.POSITIVE_INFINITY

  function consider(snapCandidate: number) {
    const dist = Math.abs(candidate.y - snapCandidate)
    if (dist < bestDist) {
      bestDist = dist
      finalY = snapCandidate
    }
  }

  for (const neighbor of neighbors) {
    if (!columnsOverlap(candidate, neighbor)) continue

    const neighborBottom = neighbor.y + neighbor.h
    if (Math.abs(candidate.y - neighborBottom) < Y_SNAP_THRESHOLD) {
      consider(neighborBottom + Y_SNAP_GUTTER)
    }

    const candidateBottom = candidate.y + candidate.h
    if (Math.abs(candidateBottom - neighbor.y) < Y_SNAP_THRESHOLD) {
      consider(neighbor.y - Y_SNAP_GUTTER - candidate.h)
    }
  }
  return finalY
}
