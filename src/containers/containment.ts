// Spatial ("sticky") container membership (spec §2.3, v0.1) — no stored
// ownership field; every question about what's "in" a container is answered
// fresh, at the moment it's asked, purely from x/y/w/h. Ported from the
// prototype's Board.jsx (`groupsContainingPoint`, `getContainedOrigins`),
// with one deliberate departure: `computeCarryIds` requires a node to be
// *completely within* a dragged container's bounds to come along with it —
// the prototype (and an earlier revision here) carried anything merely
// overlapping, which could sweep up something only partially, incidentally
// touching the container's edge.

import { fullyEncloses } from '../geometry/containment'
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
 * `excludeId`) is dragged — every node *completely within* `rect`, not
 * merely overlapping it. A node that only partially overlaps the dragged
 * container isn't considered "in" it, so it's left behind.
 *
 * Requiring full containment also settles the ancestor-vs-descendant
 * question for free: an ancestor's rect is always at least as large as
 * `rect` (it encloses it), so it can never itself be "completely within"
 * the smaller `rect` — no separate exclusion check needed, unlike a plain
 * overlap test (which is symmetric and would otherwise need one).
 *
 * A single flat pass, not a tree walk: a card nested two containers deep is
 * picked up directly because it's completely within the outer container's
 * rect too, not just the inner one — same one-pass approach as the
 * prototype's `getContainedOrigins`, just with a stricter containment test.
 * No double-motion risk, since a carried container's own drag handler is
 * never separately invoked — only the node actually grabbed computes this.
 */
export function computeCarryIds(
  rect: Rect,
  excludeId: NodeId,
  nodes: readonly Node[],
): NodeId[] {
  return nodes
    .filter((node) => node.id !== excludeId && fullyEncloses(rect, node))
    .map((node) => node.id)
}
