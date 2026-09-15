// Container creation (spec §4.5): Ctrl/Cmd+click-drag on blank canvas,
// always winning over starting on top of an existing card/container.

import { generateId } from '../schema/legacy'
import type { ContainerNode } from '../schema/node'

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
