// ⌘/Ctrl+D duplicate (spec §4.2) — mirrors ⌘/Ctrl+C+V's placement exactly
// (`computePasteOffset`/`pasteOffset.ts`): one uniform offset applied to
// every duplicated node (not a per-node recompute), which preserves
// relative positions within the set, pushed further out if the baseline
// offset would still land the duplicate overlapping an existing container.
// Without the push, a small fixed offset (the old behavior) left a
// duplicate landing right back "inside" whatever container(s) the
// original was already stuck to — never actually escaping it, unlike
// paste, which never gets adopted by an *existing* container (spec
// §2.3/§7, v0.1).

import { boundingBox } from '../geometry/containment'
import type { Rect } from '../geometry/snap'
import { generateId } from '../schema/legacy'
import type { Node } from '../schema/node'
import { computePasteOffset } from './pasteOffset'

/**
 * Fresh-id'd, offset copies of `nodes`, or `[]` if `nodes` is empty.
 * `containers` is every container currently on the board (including one
 * being duplicated itself) — the same set paste checks against, so a
 * duplicate escapes containment exactly like a paste does.
 */
export function duplicateNodes(
  nodes: readonly Node[],
  containers: readonly Rect[],
): Node[] {
  if (nodes.length === 0) return []
  const now = new Date().toISOString()
  const idMap = new Map(nodes.map((node) => [node.id, generateId()]))

  // `pasteCount: 1` — duplicate has no repeat-count memory to grow a
  // staircase from (unlike paste's clipboard state), but each duplicate's
  // own position becomes the next press's *source*, so repeated ⌘/Ctrl+D
  // naturally staircases anyway. `1` just matches the old fixed baseline
  // offset when nothing needs pushing further.
  const offset = computePasteOffset(1, boundingBox(nodes), containers)

  return nodes.map((node) => ({
    ...node,
    id: idMap.get(node.id) as string,
    x: node.x + offset,
    y: node.y + offset,
    createdAt: now,
    updatedAt: now,
  }))
}
