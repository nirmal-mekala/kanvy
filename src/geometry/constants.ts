// Size constants derived from GRID_SIZE (spec §3/§4.4/§5), ported from the
// prototype's ctx/support/260915-prototype-source/src/data/board.js.

import { GRID_SIZE } from './snap'

/** All cards share one fixed width, a multiple of GRID_SIZE (spec §5.1). */
export const CARD_WIDTH = GRID_SIZE * 14

/**
 * Fallback height for a regular text card that hasn't rendered (and
 * therefore measured its own content height) yet this session — spec
 * §2.4: the persisted `h` is the source of truth once known, this is only
 * a pre-first-render estimate.
 */
export const NEW_CARD_HEIGHT_ESTIMATE = 90

/** Minimum size for a big-text card's 8-way resize (spec §4.4), ported from the prototype. */
export const BIG_TEXT_MIN_W = GRID_SIZE * 10
export const BIG_TEXT_MIN_H = GRID_SIZE * 6

/** Starting size when a regular text card is switched to `size: 'big'` via the selection menu (spec §5.2). */
export const BIG_TEXT_DEFAULT_W = GRID_SIZE * 16
export const BIG_TEXT_DEFAULT_H = GRID_SIZE * 8

/** Minimum size for a container's 8-way resize (spec §4.4), ported from the prototype. */
export const CONTAINER_MIN_W = GRID_SIZE * 8
export const CONTAINER_MIN_H = GRID_SIZE * 6

/** Rounds `value` to the nearest grid multiple, no smaller than `min` (spec §4.4 resize snapping). */
export function snapSize(value: number, min: number): number {
  return Math.max(min, Math.round(value / GRID_SIZE) * GRID_SIZE)
}
