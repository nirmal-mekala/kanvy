// The starter board used on a fresh install and as the fallback when a
// persisted board can't be recovered (spec §9 Q12) — ported from the
// prototype's `seedBoard` (ctx/support/260915-prototype-source/src/data/
// board.js) into the v0 schema shape. A single starter note, not a demo
// board — there's no "reset" affordance to get back to a clean slate.

import { CARD_WIDTH, NEW_CARD_HEIGHT_ESTIMATE } from '../geometry/constants'
import type { Board } from './board'
import { SCHEMA_VERSION } from './board'
import { generateId } from './legacy'

const SEED_CARD_X = 88 // snapToGrid(80), spec §3 grid-midpoint offset
const SEED_CARD_Y = 104 // snapToGrid(100)

/** A fresh seed board, with new ids/timestamps each call. */
export function createSeedBoard(): Board {
  const now = new Date().toISOString()
  return {
    version: SCHEMA_VERSION,
    nodes: [
      {
        id: generateId(),
        type: 'card',
        kind: 'text',
        size: 'regular',
        x: SEED_CARD_X,
        y: SEED_CARD_Y,
        w: CARD_WIDTH,
        h: NEW_CARD_HEIGHT_ESTIMATE,
        color: 'amber',
        content: 'Welcome to Kanvy\n\nDouble-click the canvas to add a note.',
        createdAt: now,
        updatedAt: now,
      },
    ],
    edges: [],
    images: {},
  }
}
