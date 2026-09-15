// ⌘/Ctrl+D duplicate (spec §4.2) — a fixed small offset (unlike paste's
// growing staircase), keeping each duplicate's `parentId` as-is (unlike
// paste, duplicate isn't spec'd to force nodes out of their container).

import { GRID_SIZE } from '../geometry/snap'
import { generateId } from '../schema/legacy'
import type { Node } from '../schema/node'

const DUPLICATE_OFFSET = GRID_SIZE * 2

/** Fresh-id'd, offset copies of `nodes`, or `[]` if `nodes` is empty. */
export function duplicateNodes(nodes: readonly Node[]): Node[] {
  if (nodes.length === 0) return []
  const now = new Date().toISOString()
  return nodes.map((node) => ({
    ...node,
    id: generateId(),
    x: node.x + DUPLICATE_OFFSET,
    y: node.y + DUPLICATE_OFFSET,
    createdAt: now,
    updatedAt: now,
  }))
}
