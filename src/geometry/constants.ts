// Size constants derived from GRID_SIZE (spec §3/§4.4/§5), ported from the
// original prototype's board.js.

import type { TextSize } from '../schema/node'
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

export type HeadingSize = Exclude<TextSize, 'regular'>

/** Minimum width for a heading-sized (h1/h2/h3) card's 8-way resize (spec §4.4), ported from the prototype — shared by all three levels (width isn't font-size-dependent). */
export const HEADING_MIN_W = GRID_SIZE * 10

/**
 * Minimum height for a heading-sized card's 8-way resize (spec §4.4/§5.2)
 * — one per level, since each level's font size needs a different amount
 * of vertical room to fit exactly one line without clipping it. Derived
 * from `.card--h{1,2,3} .card__content` (components/card/card.css): the card's 17px
 * top bar-inset, plus the textarea's 8px top/bottom padding, plus
 * `line-height: 1.2` at that level's font size (h1 3rem/48px, h2
 * 2.25rem/36px, h3 1.75rem/28px), rounded up to the next grid multiple
 * so the line is never clipped:
 *   h1: 17 + 16 + 1.2*48 = 90.6 -> 96
 *   h2: 17 + 16 + 1.2*36 = 76.2 -> 80
 *   h3: 17 + 16 + 1.2*28 = 66.6 -> 80 (same grid step as h2 — the two
 *       levels' required heights are closer together than one grid unit)
 * If either font size, line-height, padding, or the bar inset changes,
 * these need recomputing.
 */
export const HEADING_MIN_H: Record<HeadingSize, number> = {
  h1: 96,
  h2: 80,
  h3: 80,
}

/** Starting width when a regular text card is switched to a heading size (h1/h2/h3) via the selection menu (spec §5.2) — shared by all three levels (width isn't font-size-dependent). */
export const HEADING_DEFAULT_W = GRID_SIZE * 16

/**
 * Starting height when a regular text card is switched to a heading size
 * (h1/h2/h3) via the selection menu (spec §5.2) — exactly one level's
 * `HEADING_MIN_H`, so a freshly-created heading starts sized to fit
 * exactly one line of its own font size, not an arbitrary shared default.
 */
export const HEADING_DEFAULT_H: Record<HeadingSize, number> = HEADING_MIN_H

/** Minimum size for a container's 8-way resize (spec §4.4), ported from the prototype. */
export const CONTAINER_MIN_W = GRID_SIZE * 8
export const CONTAINER_MIN_H = GRID_SIZE * 6

/**
 * Minimum width for a board card's east/west-only resize — enough to keep
 * the leading icon and a few characters of name legible. Board cards don't
 * resize vertically (height stays content/CSS-driven, as for every other
 * non-heading card), so there's no corresponding `BOARD_MIN_H`.
 */
export const BOARD_MIN_W = GRID_SIZE * 10

/** Rounds `value` to the nearest grid multiple, no smaller than `min` (spec §4.4 resize snapping). */
export function snapSize(value: number, min: number): number {
  return Math.max(min, Math.round(value / GRID_SIZE) * GRID_SIZE)
}
