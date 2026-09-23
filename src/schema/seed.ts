// The starter document used on a fresh install and as the fallback when a
// persisted board can't be recovered (spec §9 Q12) — ported from the
// prototype's `seedBoard` (ctx/support/260915-prototype-source/src/data/
// board.js) into the v0 schema shape, then revised (260918) so a brand-new
// user lands on a normal (non-home) board rather than the home board
// itself — the home board starts with just a board-card back-reference to
// it, and a first-time visit is routed straight to the welcome board (see
// `freshBoardIdAtom` in state/history/boardHistoryAtom.ts and the `/`
// route's `beforeLoad` in router.tsx). There's no "reset" affordance to get
// back to a clean slate.

import { CARD_WIDTH, NEW_CARD_HEIGHT_ESTIMATE } from '../geometry/constants'
import type { Board } from './board'
import { SCHEMA_VERSION } from './board'
import { ROOT_BOARD_ID } from './boardMeta'
import { generateId } from './legacy'

const SEED_CARD_X = 88 // snapToGrid(80), spec §3 grid-midpoint offset
const SEED_CARD_Y = 104 // snapToGrid(100)

export interface SeedResult {
  board: Board
  /** The freshly-minted non-home board a brand-new user should be dropped into. */
  welcomeBoardId: string
}

/** A fresh seed document, with new ids/timestamps each call. */
export function createSeedBoard(): SeedResult {
  const now = new Date().toISOString()
  const welcomeBoardId = generateId()
  const board: Board = {
    version: SCHEMA_VERSION,
    nodes: [
      {
        id: generateId(),
        boardId: ROOT_BOARD_ID,
        type: 'card',
        kind: 'board',
        boardRef: welcomeBoardId,
        x: SEED_CARD_X,
        y: SEED_CARD_Y,
        w: CARD_WIDTH,
        h: NEW_CARD_HEIGHT_ESTIMATE,
        color: 'gray',
        status: 'active',
        index: 0,
        content: '',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: generateId(),
        boardId: welcomeBoardId,
        type: 'card',
        kind: 'text',
        size: 'regular',
        x: SEED_CARD_X,
        y: SEED_CARD_Y,
        w: CARD_WIDTH,
        h: NEW_CARD_HEIGHT_ESTIMATE,
        color: 'gray',
        status: 'active',
        index: 0,
        content: 'Welcome to Kanvy\n\nDouble-click the canvas to add a note.',
        createdAt: now,
        updatedAt: now,
      },
    ],
    edges: [],
    boards: [
      {
        id: ROOT_BOARD_ID,
        title: 'Home',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: welcomeBoardId,
        title: 'My Kanvy Board',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ],
    images: {},
  }
  return { board, welcomeBoardId }
}
