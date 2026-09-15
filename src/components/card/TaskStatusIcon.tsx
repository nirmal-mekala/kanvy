// Shared between the selection menu's own status buttons (a later stage)
// and the small, non-interactive glyph shown in a task's drag bar (spec
// §6.1) — the whole point is that the two always match exactly. Ported
// from ctx/support/260915-prototype-source/src/components/TaskStatusIcon.jsx.

import { Circle, CircleCheck, CircleEllipsis, CircleX } from 'lucide-react'
import type { Theme } from '../../colors/colorKey'
import {
  resolveTaskStatusColor,
  type TaskStatus,
} from '../../colors/taskStatus'

const ICONS: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  blocked: CircleX,
  in_progress: CircleEllipsis,
  done: CircleCheck,
}

export function TaskStatusIcon({
  status,
  theme,
  size = 12,
  strokeWidth = 2,
  className,
  ariaLabel,
}: {
  status: TaskStatus
  theme: Theme
  size?: number
  strokeWidth?: number
  className?: string
  /** Spec §11: the drag-bar glyph is non-interactive but still meaningful
   * — pass a label (e.g. "Status: blocked") so it has an accessible name.
   * Omit when the icon sits inside an already-labeled control (e.g. a
   * selection-menu button with its own `title`), where the icon is purely
   * decorative and should stay out of the accessibility tree. */
  ariaLabel?: string
}) {
  const Icon = ICONS[status]
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      color={resolveTaskStatusColor(status, theme)}
      className={className}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    />
  )
}
