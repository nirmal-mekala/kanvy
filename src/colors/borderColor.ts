// Shared border-color resolution for cards and containers (spec §3, §6.2)
// — identical algorithm the prototype duplicates between Card.jsx and
// Group.jsx (both read the same three branches), consolidated here once
// instead of copied per component.

import { type ColorKey, resolveColorHex, type Theme } from './colorKey'
import { resolveRecencyColor } from './recency'
import { resolveTaskStatusColor, type TaskStatus } from './taskStatus'

export type ViewMode = 'standard' | 'task' | 'recency'

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
export function resolveNodeBorderColor(
  node: BorderColorInput,
  theme: Theme,
  viewMode: ViewMode,
): string {
  if (viewMode === 'task') {
    return node.task
      ? resolveTaskStatusColor(node.task.status, theme)
      : resolveColorHex('gray', theme)
  }
  if (viewMode === 'recency') {
    return resolveColorHex(
      resolveRecencyColor(node.updatedAt, new Date()),
      theme,
    )
  }
  return resolveColorHex(node.color, theme)
}
