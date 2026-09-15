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

// Big-text/container resize-minimum constants (spec §4.4's 8-way resize)
// belong here once Stage 5 (selection/dragging/resizing) actually
// consumes them — adding them now would just be unused exports.
