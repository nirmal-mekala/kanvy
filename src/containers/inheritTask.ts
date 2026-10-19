// Container task inheritance (ctx/notes/261019-inherit-container-task.md) —
// a node that lands in a task container takes on that container's task
// status: a non-task becomes a task with the parent's status, an existing
// task has its status overwritten. Only `task` is inherited, nothing else.
// "Parent" is the immediate one only (`immediateEnclosingContainer`, the
// smallest container fully enclosing the node) — never walked further up —
// and a non-task parent changes nothing (it never un-tasks anything).
// Membership stays purely spatial (spec §2.3, v0.1): this is a one-shot
// stamp at drop/creation time, not a stored relationship.

import { isTask, type Node, type NodeId, type TaskStatus } from '../schema/node'
import { immediateEnclosingContainer } from './containment'

/** The status a node at `node`'s rect would inherit from its immediate parent, or `undefined` if that parent isn't a task (or there is none). */
function inheritedStatus(
  node: Node,
  nodes: readonly Node[],
): TaskStatus | undefined {
  const parent = immediateEnclosingContainer(node, nodes)
  return parent && isTask(parent) ? parent.task : undefined
}

/**
 * `node` with its immediate parent's task status stamped on — the
 * creation-time case (double-click, image-file drop). Returned unchanged
 * when there's nothing to inherit. `nodes` is the board's live nodes, not
 * including `node` itself.
 */
export function inheritEnclosingTask<N extends Node>(
  node: N,
  nodes: readonly Node[],
): N {
  const status = inheritedStatus(node, nodes)
  return status === undefined ? node : { ...node, task: status }
}

/**
 * One node a drag moved on its own account (the grabbed node, or another
 * member of the selection) plus whatever it spatially carried along
 * (`computeCarryIds` — only ever non-empty for a grabbed container).
 */
export interface DroppedNode {
  id: NodeId
  carriedIds: readonly NodeId[]
}

/**
 * The drop-time case: for each `dropped` node whose immediate parent
 * changed between `before` (the board's live nodes at drag start) and
 * `after` (at drop) to a task container, that node *and everything it
 * carried* inherit the new parent's status. A carried node's own parent
 * never changes (it moved with its carrier), so it has no check of its own
 * — it simply follows its carrier. Repositioning within the same parent
 * changes nothing. Returns only the nodes whose `task` actually changes.
 */
export function computeDropTaskInheritance(
  dropped: readonly DroppedNode[],
  before: readonly Node[],
  after: readonly Node[],
): Map<NodeId, TaskStatus> {
  const beforeById = new Map(before.map((node) => [node.id, node]))
  const afterById = new Map(after.map((node) => [node.id, node]))
  const result = new Map<NodeId, TaskStatus>()

  for (const { id, carriedIds } of dropped) {
    const was = beforeById.get(id)
    const now = afterById.get(id)
    if (!was || !now) continue
    const newParent = immediateEnclosingContainer(now, after)
    if (!newParent || !isTask(newParent)) continue
    if (newParent.id === immediateEnclosingContainer(was, before)?.id) continue
    for (const targetId of [id, ...carriedIds]) {
      const target = afterById.get(targetId)
      if (target && target.task !== newParent.task) {
        result.set(targetId, newParent.task)
      }
    }
  }
  return result
}
