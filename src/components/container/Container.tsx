// Static container rendering (spec §4.5) — visual parity with the
// prototype's Group.jsx, minus drag/resize (Stage 5), task/color/pattern
// selection-menu wiring (Stage 8), and connector affordances (Stage 6).

import { resolveNodeBorderColor, type ViewMode } from '../../colors/borderColor'
import { resolveColorHex, type Theme } from '../../colors/colorKey'
import { patternBackgroundImage } from '../../colors/patterns'
import type { ContainerNode } from '../../schema/node'
import { TaskStatusIcon } from '../card/TaskStatusIcon'

export function Container({
  node,
  theme,
  viewMode,
  selected = false,
}: {
  node: ContainerNode
  theme: Theme
  viewMode: ViewMode
  selected?: boolean
}) {
  const borderColor = resolveNodeBorderColor(node, theme, viewMode)
  // The pattern tint is always this one fixed neutral tone, regardless of
  // the container's own selected color (spec §3) — that color applies only
  // to the border. Task view mode strips container backgrounds entirely
  // (spec §6.2) so the border's status color isn't competing with a pattern.
  const patternImage =
    viewMode === 'task'
      ? undefined
      : patternBackgroundImage(node.pattern, resolveColorHex('gray', theme))

  const classNames = ['container-node', selected && 'container-node--selected']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      data-node-id={node.id}
      data-testid="container"
      className={classNames}
      style={{
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        borderColor,
        backgroundImage: patternImage,
      }}
    >
      <div className="container-node__drag-handle">
        {node.task && (
          <TaskStatusIcon
            status={node.task.status}
            theme={theme}
            className="task-status-icon"
          />
        )}
      </div>
    </div>
  )
}
