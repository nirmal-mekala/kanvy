import { useRef, useState } from 'react'
import {
  COLORS,
  resolveColor,
  resolveTaskStatusColor,
  resolveRecencyColor,
  GROUP_MIN_W,
  GROUP_MIN_H,
  GRID_SIZE,
  snapToGrid,
} from '../data/board.js'
import { patternBackgroundImage } from '../data/patterns.js'
import { SIDES } from '../utils/geometry.js'
import TaskStatusIcon from './TaskStatusIcon.jsx'

// Each handle adjusts the edges named in its `dir` (e.g. 'se' moves both the
// south and east edges). Corners combine two single-edge adjustments.
const HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

function snapSize(value, min) {
  return Math.max(min, Math.round(value / GRID_SIZE) * GRID_SIZE)
}

export default function Group({
  group,
  zoom,
  theme,
  viewMode,
  selected,
  connectTarget,
  connectHoverSide,
  onSelect,
  onMove,
  onResize,
  getSelectionOrigins,
  registerRef,
}) {
  const dragRef = useRef(null)
  const resizeRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)

  // Only the top bar moves the group — dragging anywhere else in its body
  // is left alone (no handler here at all) so it bubbles up to Board and
  // behaves like dragging on empty canvas: a marquee-select over whatever
  // notes sit inside the border.
  function handleDragHandlePointerDown(e) {
    // Cmd/Ctrl+drag anywhere on the canvas draws a *new* group — don't let
    // an existing group underneath intercept that gesture.
    if (e.metaKey || e.ctrlKey) return
    if (e.button !== 0) return
    onSelect?.(e.shiftKey)
    // If this group is part of a multi-selection, the rest of the
    // selection (cards and groups alike) moves along with it.
    const carryOrigins = getSelectionOrigins?.(group.id) ?? []
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: group.x, originY: group.y, carryOrigins }
    setDragging(true)
    e.target.setPointerCapture(e.pointerId)
  }

  function handleDragHandlePointerMove(e) {
    if (!dragRef.current) return
    const { startX, startY, originX, originY, carryOrigins } = dragRef.current
    const dx = (e.clientX - startX) / zoom
    const dy = (e.clientY - startY) / zoom
    const snappedX = snapToGrid(originX + dx)
    const snappedY = snapToGrid(originY + dy)
    onMove(group.id, snappedX, snappedY)

    const deltaX = snappedX - originX
    const deltaY = snappedY - originY
    for (const o of carryOrigins) {
      onMove(o.id, o.x + deltaX, o.y + deltaY)
    }
  }

  function handleDragHandlePointerUp(e) {
    dragRef.current = null
    setDragging(false)
    try {
      e.target.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  function handleHandlePointerDown(dir, e) {
    e.stopPropagation()
    if (e.button !== 0) return
    resizeRef.current = {
      dir,
      startX: e.clientX,
      startY: e.clientY,
      origin: { x: group.x, y: group.y, w: group.w, h: group.h },
    }
    e.target.setPointerCapture(e.pointerId)
  }

  function handleHandlePointerMove(e) {
    const state = resizeRef.current
    if (!state) return
    const { dir, startX, startY, origin } = state
    const dx = (e.clientX - startX) / zoom
    const dy = (e.clientY - startY) / zoom

    let { x, y, w, h } = origin

    if (dir.includes('e')) w = origin.w + dx
    if (dir.includes('s')) h = origin.h + dy
    if (dir.includes('w')) {
      w = origin.w - dx
      if (w < GROUP_MIN_W) {
        x = origin.x + origin.w - GROUP_MIN_W
        w = GROUP_MIN_W
      } else {
        x = origin.x + dx
      }
    }
    if (dir.includes('n')) {
      h = origin.h - dy
      if (h < GROUP_MIN_H) {
        y = origin.y + origin.h - GROUP_MIN_H
        h = GROUP_MIN_H
      } else {
        y = origin.y + dy
      }
    }

    w = Math.max(GROUP_MIN_W, w)
    h = Math.max(GROUP_MIN_H, h)

    onResize(group.id, {
      x: snapToGrid(x),
      y: snapToGrid(y),
      w: snapSize(w, GROUP_MIN_W),
      h: snapSize(h, GROUP_MIN_H),
    })
  }

  function handleHandlePointerUp(e) {
    resizeRef.current = null
    try {
      e.target.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const isTask = !!group.taskStatus
  // Same border-color algorithm as Card.jsx: in task mode a task's border
  // shows its status instead of its own accent color, and a non-task's
  // goes quiet (the same neutral the default color uses) instead.
  const borderColor =
    viewMode === 'task'
      ? isTask
        ? resolveTaskStatusColor(group.taskStatus, theme)
        : resolveColor('gray', theme)
      : viewMode === 'recency'
        ? resolveRecencyColor(group.updatedAt, theme)
        : resolveColor(group.color, theme)
  // The pattern tint is always this one fixed neutral, regardless of the
  // group's own selected color — that color applies only to the border,
  // matching the same fixed tone the pattern picker's own swatches preview
  // (see Board.jsx). Keeps color meaningfully legible: it's the one visual
  // signal on a group, not split between a border and a tinted pattern.
  // In task mode, every group's background is stripped entirely (not just
  // recolored) — plain and quiet, so the border's task-status color reads
  // clearly without a busy pattern competing with it.
  const patternImage = viewMode === 'task' ? 'none' : patternBackgroundImage(group.pattern, COLORS.gray)

  return (
    <div
      ref={registerRef}
      data-node-id={group.id}
      className={`group${dragging ? ' group--dragging' : ''}${selected ? ' group--selected' : ''}${connectTarget ? ' group--connect-target' : ''}`}
      style={{
        left: group.x,
        top: group.y,
        width: group.w,
        height: group.h,
        borderColor,
        backgroundImage: patternImage === 'none' ? undefined : patternImage,
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div
        className="group__drag-handle"
        onPointerDown={handleDragHandlePointerDown}
        onPointerMove={handleDragHandlePointerMove}
        onPointerUp={handleDragHandlePointerUp}
      >
        {/* Purely a status readout — not interactive on its own; status is
            only ever changed through the selection menu. */}
        {group.taskStatus && (
          <TaskStatusIcon status={group.taskStatus} theme={theme} className="task-status-icon" />
        )}
      </div>

      {/* Always mounted — resizing doesn't require selecting the group
          first. Connectors (below, rendered after so they win hit-testing
          in their smaller overlapping zone) take priority right at each
          edge's midpoint; everywhere else along the border gives a resize
          cursor instead. */}
      {HANDLES.map((dir) => (
        <div
          key={dir}
          className={`resize-handle resize-handle--${dir}`}
          onPointerDown={(e) => handleHandlePointerDown(dir, e)}
          onPointerMove={handleHandlePointerMove}
          onPointerUp={handleHandlePointerUp}
        />
      ))}

      {(hovered || connectTarget) &&
        !selected &&
        SIDES.map((side) => (
          <div
            key={side}
            className={`node-connector node-connector--${side}${connectHoverSide === side ? ' node-connector--active' : ''}`}
            data-node-id={group.id}
            data-side={side}
          />
        ))}
    </div>
  )
}
