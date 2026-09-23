// Container creation (spec §4.5): Ctrl/Cmd+click-drag on blank canvas,
// always winning over starting on top of an existing card/container.

import { ROOT_BOARD_ID } from '../schema/boardMeta'
import { generateId } from '../schema/legacy'
import type { ContainerNode } from '../schema/node'

// `boardId`/`index` below are placeholders only — see cards/newCard.ts's
// matching note: `addNodeAtom` always overwrites both with the real
// current board and the real next index.

/** A freshly created container at the given world-space rect (default color/pattern, no task). */
export function createContainer(rect: {
  x: number
  y: number
  w: number
  h: number
}): ContainerNode {
  const now = new Date().toISOString()
  return {
    id: generateId(),
    boardId: ROOT_BOARD_ID,
    status: 'active',
    index: 0,
    type: 'container',
    pattern: 'none',
    color: 'gray',
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    createdAt: now,
    updatedAt: now,
  }
}
