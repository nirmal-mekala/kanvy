// Viewport pan/zoom constants (spec §4.1), ported from the prototype's
// Board.jsx.

import { GRID_SIZE } from '../../geometry/snap'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 2.5
export const ZOOM_BUTTON_STEP = 1.2
export const WHEEL_ZOOM_INTENSITY = 0.0015

/** World-space padding kept clear around the content's bounding box when zooming to fit it. */
export const FIT_PADDING = GRID_SIZE * 4

/** Smallest on-screen spacing (px) the background dot grid is drawn at before it thins out. */
export const MIN_GRID_SCREEN_SPACING = 8

/**
 * On-screen spacing for the background dot grid: `GRID_SIZE * zoom`,
 * doubled as many times as needed to stay at least
 * MIN_GRID_SCREEN_SPACING apart. At low zoom the dots would otherwise
 * crowd into a solid wash (1px-radius dots under 2px apart at 10%).
 * Purely visual — snapping still uses GRID_SIZE.
 */
export function gridScreenSpacing(zoom: number): number {
  let spacing = GRID_SIZE * zoom
  while (spacing < MIN_GRID_SCREEN_SPACING) spacing *= 2
  return spacing
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
