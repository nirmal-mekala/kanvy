import { useLayoutEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import {
  resolveColor,
  resolveTaskStatusColor,
  resolveRecencyColor,
  snapToGrid,
  Y_SNAP_THRESHOLD,
  Y_SNAP_GUTTER,
  BIG_TEXT_MIN_W,
  BIG_TEXT_MIN_H,
  GRID_SIZE,
} from '../data/board.js'
import { SIDES, clampYForGroupExclusions } from '../utils/geometry.js'
import { findSlurpableUrl } from '../utils/link.js'
import TaskStatusIcon from './TaskStatusIcon.jsx'

// Each handle adjusts the edges named in its `dir` (e.g. 'se' moves both the
// south and east edges). Corners combine two single-edge adjustments. Only
// rendered for big-text cards — regular notes are fixed-width/content-height.
const HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

function snapSize(value, min) {
  return Math.max(min, Math.round(value / GRID_SIZE) * GRID_SIZE)
}

export default function Card({
  card,
  imageSrc,
  zoom,
  theme,
  viewMode,
  selected,
  connectTarget,
  connectHoverSide,
  autoFocus,
  onSelect,
  onMove,
  onUpdate,
  onSlurpLink,
  getSiblingRects,
  getSelectionOrigins,
  getGroupExclusions,
  registerRef,
}) {
  const isImage = !!card.imageId
  const isLink = !!card.linkUrl
  // Neither an image nor a link card is ever "big" sized (see
  // convertCardToImage/convertCardToLink in useBoard.js) — this is just
  // belt-and-suspenders against stale data.
  const isBig = !isImage && !isLink && card.textSize === 'big'
  // Every non-media card always shows its caption; an image/link card only
  // once it has text or is selected (see the textarea below).
  const showCaption = (!isImage && !isLink) || card.content || selected
  const isTask = !!card.taskStatus
  const isDone = card.taskStatus === 'done'
  // Task mode dims everything that *isn't* a task, so tasks stand out
  // instead of blending in with the rest of the board.
  const isDimmedByViewMode = viewMode === 'task' && !isTask
  // In task mode, a task's border shows its status instead of its own
  // accent color — a louder, at-a-glance signal than the small bar icon
  // alone. A non-task's border goes the opposite direction: the same quiet
  // neutral used for the default color elsewhere, so it visually recedes.
  const borderColor =
    viewMode === 'task'
      ? isTask
        ? resolveTaskStatusColor(card.taskStatus, theme)
        : resolveColor('gray', theme)
      : viewMode === 'recency'
        ? resolveRecencyColor(card.updatedAt, theme)
        : resolveColor(card.color, theme)
  const dragRef = useRef(null)
  const resizeRef = useRef(null)
  const contentRef = useRef(null)
  const cardElRef = useRef(null)
  const autoFocusRef = useRef(autoFocus)
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)

  function setCardEl(el) {
    cardElRef.current = el
    registerRef?.(el)
  }

  // Regular notes grow to fit their content; big text has an explicit,
  // user-resized height instead, so it never participates in this.
  useLayoutEffect(() => {
    if (isBig) return
    const el = contentRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [card.content, card.w, isBig])

  // Only checked once, at mount — e.g. right after a duplicate is created,
  // so it's immediately ready to edit instead of just sitting selected.
  useLayoutEffect(() => {
    if (!autoFocusRef.current) return
    const el = contentRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  function handlePointerDown(e) {
    // only the left button drags a card; right-click is reserved for canvas panning
    if (e.button !== 0) return
    // Cmd/Ctrl+drag anywhere on the canvas draws a new grouping box — don't
    // let a card underneath intercept that gesture.
    if (e.metaKey || e.ctrlKey) return
    // Dragging from a connector dot draws a connection — let it bubble up
    // to Board instead of selecting/moving this card.
    if (e.target.closest('.node-connector')) return
    onSelect?.(e.shiftKey)
    // don't start a drag from interactive children
    if (e.target.closest('.no-drag')) return
    const startX = e.clientX
    const startY = e.clientY
    const originX = card.x
    const originY = card.y
    // If this card is part of a multi-selection, the rest of the selection
    // (cards and groups alike) moves along with it, preserving their
    // relative layout.
    const carryOrigins = getSelectionOrigins?.(card.id) ?? []
    const excludeIds = [card.id, ...carryOrigins.map((o) => o.id)]
    dragRef.current = { startX, startY, originX, originY, carryOrigins, excludeIds }
    setDragging(true)
    e.target.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e) {
    if (!dragRef.current) return
    const { startX, startY, originX, originY, carryOrigins, excludeIds } = dragRef.current
    // Screen-space pointer movement maps to a smaller world-space movement
    // as the canvas zooms in, and a larger one as it zooms out.
    const dx = (e.clientX - startX) / zoom
    const dy = (e.clientY - startY) / zoom
    const rawX = originX + dx
    const rawY = originY + dy
    const snappedX = snapToGrid(rawX)

    // Vertical position doesn't follow the dot grid: cards vary in height,
    // so instead we look for a neighboring card sharing this column and, if
    // one is within Y_SNAP_THRESHOLD, snap to a fixed gutter from its edge.
    let finalY = snapToGrid(rawY)
    let bestDist = Infinity
    const selfHeight = cardElRef.current?.offsetHeight ?? 0
    const siblings = getSiblingRects?.(excludeIds) ?? []

    for (const s of siblings) {
      const overlapsColumn = snappedX < s.x + s.width && snappedX + card.w > s.x
      if (!overlapsColumn) continue

      const gapBelow = rawY - (s.y + s.height)
      if (Math.abs(gapBelow) < Y_SNAP_THRESHOLD) {
        const candidate = s.y + s.height + Y_SNAP_GUTTER
        const dist = Math.abs(rawY - candidate)
        if (dist < bestDist) {
          bestDist = dist
          finalY = candidate
        }
      }

      const gapAbove = s.y - (rawY + selfHeight)
      if (Math.abs(gapAbove) < Y_SNAP_THRESHOLD) {
        const candidate = s.y - Y_SNAP_GUTTER - selfHeight
        const dist = Math.abs(rawY - candidate)
        if (dist < bestDist) {
          bestDist = dist
          finalY = candidate
        }
      }
    }

    // Never let the card end up straddling a group's top-edge no-fly zone —
    // it can still be placed inside the group or entirely above the border.
    finalY = clampYForGroupExclusions(snappedX, card.w, selfHeight, finalY, getGroupExclusions?.() ?? [])

    onMove(card.id, snappedX, finalY)

    // Carry the rest of the selection along by the same delta, keeping
    // their positions relative to this (snapped) card unchanged.
    const deltaX = snappedX - originX
    const deltaY = finalY - originY
    for (const o of carryOrigins) {
      onMove(o.id, o.x + deltaX, o.y + deltaY)
    }
  }

  function handlePointerUp(e) {
    dragRef.current = null
    setDragging(false)
    try {
      e.target.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  // Big-text resize handles — same border-drag model as a group's, but
  // always available (not gated on selection) and reusing onUpdate.
  function handleResizeHandlePointerDown(dir, e) {
    e.stopPropagation()
    if (e.button !== 0) return
    resizeRef.current = {
      dir,
      startX: e.clientX,
      startY: e.clientY,
      origin: { x: card.x, y: card.y, w: card.w, h: card.h },
    }
    e.target.setPointerCapture(e.pointerId)
  }

  function handleResizeHandlePointerMove(e) {
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
      if (w < BIG_TEXT_MIN_W) {
        x = origin.x + origin.w - BIG_TEXT_MIN_W
        w = BIG_TEXT_MIN_W
      } else {
        x = origin.x + dx
      }
    }
    if (dir.includes('n')) {
      h = origin.h - dy
      if (h < BIG_TEXT_MIN_H) {
        y = origin.y + origin.h - BIG_TEXT_MIN_H
        h = BIG_TEXT_MIN_H
      } else {
        y = origin.y + dy
      }
    }

    w = Math.max(BIG_TEXT_MIN_W, w)
    h = Math.max(BIG_TEXT_MIN_H, h)

    onUpdate(card.id, {
      x: snapToGrid(x),
      y: snapToGrid(y),
      w: snapSize(w, BIG_TEXT_MIN_W),
      h: snapSize(h, BIG_TEXT_MIN_H),
    })
  }

  function handleResizeHandlePointerUp(e) {
    resizeRef.current = null
    try {
      e.target.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  // Only a plain text note (not already an image or a link) ever "slurps" a
  // typed/pasted URL out of its own content into a link node — an image
  // node's caption and a link node's own caption are exempt, so typing a
  // URL there is always left as literal text (images and links are
  // mutually exclusive node kinds). Live-typing requires a trailing space
  // right after the URL (so it doesn't fire mid-URL); blur is a catch-all
  // for a URL left at the very end with nothing typed after it.
  function handleContentChange(e) {
    const value = e.target.value
    if (!isImage && !isLink) {
      const slurp = findSlurpableUrl(value, { requireTrailingSpace: true })
      if (slurp) {
        onSlurpLink?.(card.id, slurp.url, slurp.remaining)
        return
      }
    }
    onUpdate(card.id, { content: value })
  }

  function handleContentBlur() {
    if (isImage || isLink) return
    const slurp = findSlurpableUrl(card.content, { requireTrailingSpace: false })
    if (slurp) onSlurpLink?.(card.id, slurp.url, slurp.remaining)
  }

  return (
    <div
      ref={setCardEl}
      data-node-id={card.id}
      className={`card${isBig ? ' card--big' : ''}${isImage ? ' card--image' : ''}${isLink ? ' card--link' : ''}${isDone ? ' card--done' : ''}${isDimmedByViewMode ? ' card--dimmed' : ''}${dragging ? ' card--dragging' : ''}${selected ? ' card--selected' : ''}${connectTarget ? ' card--connect-target' : ''}`}
      style={{
        left: card.x,
        top: card.y,
        width: card.w,
        height: isBig ? card.h : undefined,
        borderColor,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div className="card__inner">
        <div className="card__bar">
          {/* Purely a status readout — not interactive on its own; status is
              only ever changed through the selection menu. */}
          {card.taskStatus && <TaskStatusIcon status={card.taskStatus} theme={theme} className="task-status-icon" />}
        </div>

        {isImage && imageSrc && (
          // Full node width, height derived from the image's own intrinsic
          // aspect ratio (no explicit height is ever set) — always, since
          // nothing here constrains height directly. The divider border
          // only makes sense when there's a caption below it to divide from
          // — otherwise (caption hidden, see below) it just reads as a
          // stray gray sliver between the image and the card's own border.
          <div className={`card__media${showCaption ? ' card__media--divided' : ''}`}>
            <img className="card__image" src={imageSrc} alt="" draggable={false} />
            {/* Done tasks, and (in task view mode) anything that isn't a
                task, render their image monochrome, tinted toward the
                current theme's ink color rather than plain grayscale. */}
            {(isDone || isDimmedByViewMode) && <div className="card__media-tint" aria-hidden="true" />}
          </div>
        )}

        {isLink && (
          <>
            {/* Not a link itself, and not no-drag — behaves exactly like an
                image card's image (grabbable/draggable, clicking it just
                selects the card) rather than looking clickable-to-navigate
                the way the whole card used to. */}
            {card.linkImageUrl && (
              <div className="card__media">
                <img className="card__link-image" src={card.linkImageUrl} alt="" draggable={false} />
                {(isDone || isDimmedByViewMode) && <div className="card__media-tint" aria-hidden="true" />}
              </div>
            )}
            <div className="card__link-meta">
              {/* The only actually-clickable-to-navigate part of a link
                  card — the external-link icon and underline-on-hover are
                  what should read as "this opens something", not the card
                  as a whole. */}
              <a
                className="card__link-title no-drag"
                href={card.linkUrl}
                target="_blank"
                rel="noreferrer noopener"
                draggable={false}
              >
                {/* Truncated separately from the icon (a flex sibling, not
                    inline content) — an ellipsis inside a multi-line clamp
                    can otherwise cut the icon off along with the text for a
                    long title, rather than truncating around it. */}
                <span className="card__link-title-text">
                  {card.linkStatus === 'loading' ? 'Loading…' : card.linkTitle || card.linkUrl}
                </span>
                <ExternalLink size={12} strokeWidth={2} className="card__link-icon" />
              </a>
            </div>
          </>
        )}

        {/* An image or link card with no text stays media-only until
            selected — that's when the (now-visible) placeholder invites
            adding a caption. Any actual text keeps it visible regardless of
            selection. */}
        {showCaption && (
          <textarea
            ref={contentRef}
            className="card__content no-drag"
            value={card.content}
            placeholder="Write something..."
            onChange={handleContentChange}
            onBlur={handleContentBlur}
            rows={1}
          />
        )}
      </div>

      {/* Big text only — resizable in any direction like a group's border,
          always available (not gated on selection). */}
      {isBig &&
        HANDLES.map((dir) => (
          <div
            key={dir}
            className={`resize-handle resize-handle--${dir}`}
            onPointerDown={(e) => handleResizeHandlePointerDown(dir, e)}
            onPointerMove={handleResizeHandlePointerMove}
            onPointerUp={handleResizeHandlePointerUp}
          />
        ))}

      {(hovered || selected || connectTarget) &&
        SIDES.map((side) => (
          <div
            key={side}
            className={`node-connector node-connector--${side}${connectHoverSide === side ? ' node-connector--active' : ''}`}
            data-node-id={card.id}
            data-side={side}
          />
        ))}
    </div>
  )
}
