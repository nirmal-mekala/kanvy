// Spatial ("sticky") container membership (spec §2.3, v0.1) — no stored
// ownership field; every question about what's "in" a container is answered
// fresh, at the moment it's asked, purely from x/y/w/h. Ported from the
// prototype's Board.jsx (`groupsContainingPoint`, `getContainedOrigins`).

import { fullyEncloses, overlapArea } from '../geometry/containment'
import type { Rect } from '../geometry/snap'
import type { ContainerNode, Node, NodeId } from '../schema/node'

/**
 * Every container whose bounds contain `point`, innermost (smallest area)
 * first — shared by anything that needs "which container is a screen point
 * inside of," whether it wants every enclosing container (a ctrl/cmd+drag's
 * click-origin, so a marquee never selects a container it started inside
 * of) or just the innermost one.
 */
export function containersContainingPoint(
  point: { x: number; y: number },
  nodes: readonly Node[],
): ContainerNode[] {
  return nodes
    .filter(
      (node): node is ContainerNode =>
        node.type === 'container' &&
        point.x >= node.x &&
        point.x <= node.x + node.w &&
        point.y >= node.y &&
        point.y <= node.y + node.h,
    )
    .sort((a, b) => a.w * a.h - b.w * b.h)
}

/**
 * Every other node that should move along when the node at `rect` (id
 * `excludeId`) is dragged — every node whose box overlaps `rect`, except a
 * container that fully encloses `rect` (an ancestor "overlaps" a descendant
 * just as much as the descendant overlaps it, so `fullyEncloses` is what
 * tells the two apart — only a descendant should ever be carried along).
 *
 * A single flat pass, not a tree walk: a card nested two containers deep is
 * picked up directly because its box geometrically overlaps the outer
 * container's rect too, exactly like the prototype's `getContainedOrigins`.
 * No double-motion risk, since a carried container's own drag handler is
 * never separately invoked — only the node actually grabbed computes this.
 */
export function computeCarryIds(
  rect: Rect,
  excludeId: NodeId,
  nodes: readonly Node[],
): NodeId[] {
  return nodes
    .filter((node) => {
      if (node.id === excludeId) return false
      if (overlapArea(rect, node) <= 0) return false
      return !(node.type === 'container' && fullyEncloses(node, rect))
    })
    .map((node) => node.id)
}
