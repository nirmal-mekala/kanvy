// Container paint order (spec §2.3, §4.5) — containers have no z-index of
// their own; DOM order is the only mechanism that decides which one paints
// on top of another (see Canvas.tsx). Plain array order isn't good enough:
// a container drawn around existing ones (ctrl/cmd-drag) is appended to the
// *end* of the nodes array, so a naive array-order render would paint it
// over the very containers it geometrically encloses. Render order must
// instead respect nesting depth — a container renders (and so paints)
// before every container it geometrically encloses, however deep.
//
// This is a depth-first traversal (each root's whole subtree emitted
// contiguously, in original array order among siblings), not a flat sort
// by depth number — sorting by depth alone interleaves *separate* subtrees
// that happen to share a depth (e.g. a duplicated parent+child container
// pair leaves the original child and the duplicated child both at depth 1,
// sorting them adjacent to each other regardless of lineage). A depth-first
// walk keeps each subtree grouped, so a newly-created or newly-duplicated
// subtree — appended to the end of the nodes array — paints entirely above
// the whole of whatever was there before it.
//
// v0.1 (ctx/notes/260915-kanvy-spec.md §2.3): there's no stored `parentId`
// to walk anymore, so the "parent" edge this traversal groups by is derived
// fresh from geometry instead — see `immediateEnclosingContainer`
// (./containment.ts). The traversal itself is otherwise unchanged.

import type { ContainerNode } from '../schema/node'
import { immediateEnclosingContainer } from './containment'

/**
 * `containers` reordered into a depth-first pre-order by geometric nesting
 * — every container renders (and so paints) after whatever encloses it,
 * immediately followed by its own geometrically-nested containers, so a
 * whole subtree always stays contiguous instead of interleaving with
 * unrelated subtrees at the same nesting depth. Roots (and containers
 * nested in the same parent) keep their original relative array order.
 */
export function sortContainersForRender(
  containers: readonly ContainerNode[],
): ContainerNode[] {
  const childrenByParent = new Map<string, ContainerNode[]>()
  const roots: ContainerNode[] = []

  for (const container of containers) {
    const parent = immediateEnclosingContainer(container, containers)
    if (parent) {
      const siblings = childrenByParent.get(parent.id)
      if (siblings) siblings.push(container)
      else childrenByParent.set(parent.id, [container])
    } else {
      roots.push(container)
    }
  }

  const ordered: ContainerNode[] = []
  function visit(container: ContainerNode) {
    ordered.push(container)
    for (const child of childrenByParent.get(container.id) ?? []) {
      visit(child)
    }
  }
  for (const root of roots) visit(root)
  return ordered
}
