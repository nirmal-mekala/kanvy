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
 * `bestDist` neighbor comparison) — an earlier revision here returned on
 * the first qualifying neighbor and skipped the grid fallback entirely,
 * which (with several neighbors stacked in the same column) made a fast
 * drag appear to "stick" as it locked onto whichever neighbor came first
 * in array order instead of the one actually nearest the cursor.
 */
export function snapY(candidate: Rect, neighbors: readonly Rect[]): number {
  let finalY = snapToGridMidpoint(candidate.y)
  // The grid snap competes on equal footing with every neighbor gutter —
  // seeded with its own distance, not `Infinity`, so a neighbor whose
  // gutter is actually farther from the raw position than the grid is
  // never preferred just for existing.
  let bestDist = Math.abs(candidate.y - finalY)

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
