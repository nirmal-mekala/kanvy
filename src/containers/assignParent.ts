// Drop-by-largest-overlap parent assignment (spec §2.3) — recomputed only
// at drop time, never continuously during a drag.

import {
  findParentByLargestOverlap,
  type IdentifiedRect,
} from '../geometry/containment'
import type { Rect } from '../geometry/snap'
import type { Node, NodeId } from '../schema/node'
import { getDescendantIds } from './descendants'

/**
 * The container `rect` (belonging to `nodeId`) should become a child of on
 * drop, or `undefined` if it lands outside every container. A node can
 * never become its own descendant's child — those candidates are excluded,
 * along with the node itself.
 */
export function computeParentIdOnDrop(
  nodeId: NodeId,
  rect: Rect,
  nodes: readonly Node[],
): NodeId | undefined {
  const excluded = getDescendantIds(nodeId, nodes)
  excluded.add(nodeId)

  const candidates: IdentifiedRect[] = nodes
    .filter((node) => node.type === 'container' && !excluded.has(node.id))
    .map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      w: node.w,
      h: node.h,
    }))

  return findParentByLargestOverlap(rect, candidates)
}
