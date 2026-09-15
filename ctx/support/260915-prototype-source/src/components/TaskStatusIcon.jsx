import { Circle, CircleX, CircleEllipsis, CircleCheck } from 'lucide-react'
import { resolveTaskStatusColor } from '../data/board.js'

const ICONS = {
  todo: Circle,
  blocked: CircleX,
  in_progress: CircleEllipsis,
  done: CircleCheck,
}

// Shared between the status menu's own buttons (Board.jsx) and the small,
// non-interactive glyph shown in a task's drag bar (Card.jsx/Group.jsx) —
// the whole point is that the two always match exactly.
export default function TaskStatusIcon({ status, theme, size = 12, strokeWidth = 2, className }) {
  const Icon = ICONS[status]
  if (!Icon) return null
  return <Icon size={size} strokeWidth={strokeWidth} color={resolveTaskStatusColor(status, theme)} className={className} />
}
