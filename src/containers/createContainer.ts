// Container creation (spec §4.5): Ctrl/Cmd+click-drag on blank canvas,
// always winning over starting on top of an existing card/container.

import { UNASSIGNED_BOARD_ID } from '../schema/boardMeta'
import { generateId } from '../schema/legacy'
import type { ContainerNode } from '../schema/node'

// `boardId`/`index` below are placeholders only — see cards/newCard.ts's
// matching note: `addNodeAtom` always overwrites both with the real
// current board and the real next index.

/** A freshly created container at the given world-space rect (default color/pattern, task `'none'`). */
export function createContainer(rect: {
  x: number
  y: number
  w: number
  h: number
}): ContainerNode {
  const now = new Date().toISOString()
  return {
    id: generateId(),
    boardId: UNASSIGNED_BOARD_ID,
    status: 'active',
    position: 0,
    nodeType: 'container',
    pattern: 'none',
    color: 'gray',
    task: 'none',
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    createdAt: now,
    updatedAt: now,
  }
}
