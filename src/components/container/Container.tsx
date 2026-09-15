// Static container rendering (spec §4.5) — visual parity with the
// prototype's Group.jsx, minus drag/resize (Stage 5), task/color/pattern
// selection-menu wiring (Stage 8), and connector affordances (Stage 6).

import { useState } from 'react'
import { resolveNodeBorderColor, type ViewMode } from '../../colors/borderColor'
import { resolveColorHex, type Theme } from '../../colors/colorKey'
import { patternBackgroundImage } from '../../colors/patterns'
import type { Side } from '../../geometry/anchor'
import type { ContainerNode } from '../../schema/node'
import { NodeConnectors } from '../canvas/NodeConnectors'
import { ResizeHandles } from '../canvas/ResizeHandles'
import type { ResizeDir, ResizeKind } from '../canvas/useBoardInteraction'
import { TaskStatusIcon } from '../card/TaskStatusIcon'

// CRAP scoring penalizes this component's 0% coverage — component tests
// aren't a required tier for v0 (spec §13); real coverage comes from
// e2e/visual-regression specs (Stages 4-10), which fallow's static
// analysis can't see.
// fallow-ignore-next-line complexity
export function Container({
  node,
  theme,
  viewMode,
  selected = false,
  connectorsVisible = false,
  connectorActiveSide = null,
  onDragHandlePointerDown,
  onDragHandlePointerMove,
  onDragHandlePointerUp,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
  onConnectorPointerDown,
  onConnectorPointerMove,
  onConnectorPointerUp,
}: {
  node: ContainerNode
  theme: Theme
  viewMode: ViewMode
  selected?: boolean
  connectorsVisible?: boolean
  connectorActiveSide?: Side | null
  onDragHandlePointerDown?: (id: string, e: React.PointerEvent) => void
  onDragHandlePointerMove?: (e: React.PointerEvent) => void
  onDragHandlePointerUp?: (e: React.PointerEvent) => void
  onResizePointerDown?: (
    id: string,
    dir: ResizeDir,
    kind: ResizeKind,
    e: React.PointerEvent,
  ) => void
  onResizePointerMove?: (e: React.PointerEvent) => void
  onResizePointerUp?: (e: React.PointerEvent) => void
  onConnectorPointerDown?: (
    id: string,
    side: Side,
    e: React.PointerEvent,
  ) => void
  onConnectorPointerMove?: (e: React.PointerEvent) => void
  onConnectorPointerUp?: (e: React.PointerEvent) => void
}) {
  const [hovered, setHovered] = useState(false)
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
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div
        className="container-node__drag-handle"
        onPointerDown={
          onDragHandlePointerDown &&
          ((e) => onDragHandlePointerDown(node.id, e))
        }
        onPointerMove={onDragHandlePointerMove}
        onPointerUp={onDragHandlePointerUp}
      >
        {node.task && (
          <TaskStatusIcon
            status={node.task.status}
            theme={theme}
            className="task-status-icon"
          />
        )}
      </div>
      {onResizePointerDown && onResizePointerMove && onResizePointerUp && (
        <ResizeHandles
          id={node.id}
          kind="container"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
        />
      )}
      {(hovered || selected || connectorsVisible) &&
        onConnectorPointerDown &&
        onConnectorPointerMove &&
        onConnectorPointerUp && (
          <NodeConnectors
            nodeId={node.id}
            activeSide={connectorActiveSide}
            onPointerDown={onConnectorPointerDown}
            onPointerMove={onConnectorPointerMove}
            onPointerUp={onConnectorPointerUp}
          />
        )}
    </div>
  )
}
