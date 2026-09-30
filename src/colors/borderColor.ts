// Shared border-accent resolution for cards and containers (spec §3, §6.2)
// — identical algorithm the prototype duplicates between Card.jsx and
// Group.jsx (both read the same three branches), consolidated here once
// instead of copied per component. Returns a palette key, not a color:
// the element carries it as `data-accent` and styles/accents.css maps it
// to the (theme-aware) token.

import type { ColorKey } from './colorKey'
import { resolveRecencyColor } from './recency'
import type { TaskStatus } from './taskStatus'

export type ViewMode = 'standard' | 'task' | 'recency'

export type NodeAccent = ColorKey | `task-${TaskStatus}`

export interface BorderColorInput {
  color: ColorKey
  task?: { status: TaskStatus } | undefined
  updatedAt: string
}

/**
 * In task view mode, a task's border shows its status color instead of its
 * own accent color (louder than the glyph alone); a non-task's border goes
 * quiet (the same neutral the default color uses). In recency mode, every
 * border derives from `updatedAt` regardless of task status. Otherwise,
 * the node's own selected accent color (spec §6.2).
 */
export function resolveNodeAccent(
  node: BorderColorInput,
  viewMode: ViewMode,
  now: Date,
): NodeAccent {
  if (viewMode === 'task') {
    return node.task ? `task-${node.task.status}` : 'gray'
  }
  if (viewMode === 'recency') return resolveRecencyColor(node.updatedAt, now)
  return node.color
}
