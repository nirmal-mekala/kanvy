// Formal descendant traversal (spec §2.3) — re-derives what the prototype
// computed spatially (bounding-box overlap at drag-time) from the explicit
// `parentId` relationship instead.

import type { Node, NodeId } from '../schema/node'

/**
 * Every node whose `parentId` chain eventually reaches `rootId`, however
 * deep. Has real unit coverage (descendants.test.ts) — fallow's CRAP score
 * is still flagged because this audit run has no merged Istanbul coverage
 * report (`@vitest/coverage-v8` isn't an installed dependency; adding one
 * solely to satisfy the static audit would be scope beyond phase 7 Stage 5).
 */
// fallow-ignore-next-line complexity
export function getDescendantIds(
  rootId: NodeId,
  nodes: readonly Node[],
): Set<NodeId> {
  const childrenByParent = new Map<NodeId, NodeId[]>()
  for (const node of nodes) {
    if (!node.parentId) continue
    const siblings = childrenByParent.get(node.parentId)
    if (siblings) siblings.push(node.id)
    else childrenByParent.set(node.parentId, [node.id])
  }

  const descendants = new Set<NodeId>()
  const queue = [...(childrenByParent.get(rootId) ?? [])]
  while (queue.length > 0) {
    const id = queue.pop()
    if (id === undefined || descendants.has(id)) continue
    descendants.add(id)
    queue.push(...(childrenByParent.get(id) ?? []))
  }
  return descendants
}
