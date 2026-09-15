// Viewport pan/zoom constants (spec §4.1), ported from the prototype's
// Board.jsx.

import { GRID_SIZE } from '../../geometry/snap'

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2.5
export const ZOOM_BUTTON_STEP = 1.2
export const WHEEL_ZOOM_INTENSITY = 0.0015

/** World-space padding kept clear around the content's bounding box when zooming to fit it. */
export const FIT_PADDING = GRID_SIZE * 4

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
