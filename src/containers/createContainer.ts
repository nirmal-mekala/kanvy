// Container creation (spec §4.5): Ctrl/Cmd+click-drag on blank canvas,
// always winning over starting on top of an existing card/container.

import { ROOT_BOARD_ID } from '../schema/boardMeta'
import { generateId } from '../schema/legacy'
import type { ContainerNode } from '../schema/node'

// `boardId` hardcoded to root for now — see cards/newCard.ts's matching
// note; replaced with the actual current board once
// state/atoms/nodes.ts's `currentBoardIdAtom` exists (multiboard-support
// implementation plan, Sub-phase 2).

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
