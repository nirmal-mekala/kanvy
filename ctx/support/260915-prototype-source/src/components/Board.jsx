import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Type, Heading1, List, ListTodo, ZoomIn, ZoomOut, CircleHelp } from 'lucide-react'
import Card from './Card.jsx'
import Group from './Group.jsx'
import Edge from './Edge.jsx'
import TaskStatusIcon from './TaskStatusIcon.jsx'
import {
  COLORS,
  swatchBackground,
  EDGE_COLOR,
  GRID_SIZE,
  CARD_WIDTH,
  NEW_CARD_HEIGHT_ESTIMATE,
  DEFAULT_TEXT_SIZE,
  BIG_TEXT_DEFAULT_W,
  BIG_TEXT_DEFAULT_H,
  TASK_STATUSES,
  DEFAULT_TASK_STATUS,
} from '../data/board.js'
import { PATTERNS } from '../data/patterns.js'
import { anchorPoint, bestSide, boxCenter, curvedPath, clampYForGroupExclusions } from '../utils/geometry.js'
import { processImageFile, getImageFilesFromDataTransfer, dataTransferHasFiles } from '../utils/image.js'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 2.5
const ZOOM_BUTTON_STEP = 1.2
const WHEEL_ZOOM_INTENSITY = 0.0015
const MARQUEE_DRAG_THRESHOLD = 3
// Our own double-click detection (see handlePointerUp) — tighter than
// browsers' native dblclick threshold, which tends to fire even for two
// fairly deliberate, separated clicks.
const DOUBLE_CLICK_MS = 300
const DOUBLE_CLICK_DIST = 6

// Just the non-obvious stuff — the standard whiteboard-app conventions
// (drag to move/select, scroll to pan, Cmd+D/C/V/Z, delete, etc.) are left
// out on purpose.
const SHORTCUTS = [
  ['⌘/Ctrl + click + drag', 'Create a grouping box'],
  ['Drag & drop an image file', 'Create an image note'],
  ['Type a URL, then a space', 'Convert the note into a link'],
  ['⌘/Ctrl + V (with an image)', 'Paste an image into a focused/selected note, or create a new image note'],
  ['⌘/Ctrl + V (with a link)', 'Paste a link into a focused/selected note, or create a new link note'],
  ['⌘/Ctrl + Shift + Enter', 'Zoom out to fit everything in view'],
]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

const Board = forwardRef(function Board(
  {
    board,
    selectedIds,
    onSelectionChange,
    onCreateCard,
    onCreateImageCard,
    onCreateLinkCard,
    onSlurpLink,
    onCreateGroup,
    onCreateEdge,
    focusCardId,
    actions,
    theme,
    viewMode,
  },
  ref,
) {
  const boardElRef = useRef(null)
  const panRef = useRef(null)
  const marqueeRef = useRef(null)
  const creatingGroupRef = useRef(null)
  const connectingRef = useRef(null)
  const lastClickRef = useRef({ time: -Infinity, x: 0, y: 0 })
  const cardElsRef = useRef(new Map())
  const groupElsRef = useRef(new Map())
  const cardResizeObserverRef = useRef(null)
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 })
  const [panning, setPanning] = useState(false)
  const [marqueeRect, setMarqueeRect] = useState(null)
  const [creatingGroupRect, setCreatingGroupRect] = useState(null)
  const [connectingPreview, setConnectingPreview] = useState(null)
  const [helpOpen, setHelpOpen] = useState(false)
  // Bumped whenever a regular note's DOM height actually changes (see the
  // ResizeObserver below) purely to force a re-render — nothing reads the
  // value itself. A regular note's height lives only in the DOM (it grows
  // with content), so nothing about it is otherwise part of React state;
  // without this, things anchored to it (arrow endpoints, the selection
  // menu) could get stuck reading a stale height after a discrete change
  // with no follow-up render to pick up the corrected measurement — e.g.
  // switching a note from big text back to regular, where typing's usual
  // "every keystroke re-renders anyway" safety net doesn't apply.
  const [, bumpLayoutTick] = useState(0)

  useEffect(() => {
    cardResizeObserverRef.current = new ResizeObserver(() => {
      bumpLayoutTick((t) => t + 1)
    })
    return () => cardResizeObserverRef.current?.disconnect()
  }, [])

  // Recency-mode border colors (resolveRecencyColor) are a function of the
  // current time, not just board data — without this, a card sitting open
  // and untouched would silently drift into a stale color bucket (e.g.
  // green past the one-day mark) with nothing to trigger the re-render
  // that would pick up the change. Only runs while actually in that mode.
  useEffect(() => {
    if (viewMode !== 'recency') return
    const interval = setInterval(() => bumpLayoutTick((t) => t + 1), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [viewMode])

  useEffect(() => {
    const el = boardElRef.current
    if (!el) return

    function onWheel(e) {
      // Let the help panel scroll natively instead of hijacking the wheel
      // into a canvas zoom/pan — this listener is on the board itself, so
      // it'd otherwise fire even while scrolling over the modal on top of it.
      if (e.target.closest('.help-panel')) return
      e.preventDefault()
      if (e.metaKey || e.ctrlKey) {
        // Trackpad pinch gestures also report as wheel events with ctrlKey
        // set, so this covers both pinch-to-zoom and Ctrl/Cmd+scroll.
        const rect = el.getBoundingClientRect()
        zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * WHEEL_ZOOM_INTENSITY))
        return
      }
      setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (!helpOpen) return
    function onKeyDown(e) {
      if (e.key === 'Escape') setHelpOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [helpOpen])

  useEffect(() => {
    function onKeyDown(e) {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key !== 'Enter') return
      e.preventDefault()
      zoomToFitAll()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Keep (anchorX, anchorY) — in board-viewport pixels — visually fixed while
  // zoom changes by `factor`, so wheel-zoom tracks the cursor and button-zoom
  // tracks the viewport center.
  function zoomAt(anchorX, anchorY, factor) {
    setView((v) => {
      const newZoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM)
      if (newZoom === v.zoom) return v
      const worldX = (anchorX - v.x) / v.zoom
      const worldY = (anchorY - v.y) / v.zoom
      return { zoom: newZoom, x: anchorX - worldX * newZoom, y: anchorY - worldY * newZoom }
    })
  }

  function zoomByButton(factor) {
    const rect = boardElRef.current.getBoundingClientRect()
    zoomAt(rect.width / 2, rect.height / 2, factor)
  }

  // Only reachable by clicking the zoom-percentage button itself — no
  // keyboard shortcut for this one.
  function resetZoom() {
    const rect = boardElRef.current.getBoundingClientRect()
    const anchorX = rect.width / 2
    const anchorY = rect.height / 2
    setView((v) => {
      if (v.zoom === 1) return v
      const worldX = (anchorX - v.x) / v.zoom
      const worldY = (anchorY - v.y) / v.zoom
      return { zoom: 1, x: anchorX - worldX, y: anchorY - worldY }
    })
  }

  // World-space padding kept clear around the content's bounding box when
  // zooming to fit it, so notes right at the edge aren't flush against the
  // viewport border.
  const FIT_PADDING = GRID_SIZE * 4

  // Zooms out (never in past 100% — this is for seeing the big picture,
  // not for magnifying a single note) and pans so every card and group's
  // combined bounding box fits entirely inside the viewport, centered.
  // A meaningful "here's everything" view, rather than just panning to a
  // spot that has no inherent significance at whatever zoom happens to be
  // already set.
  function zoomToFitAll() {
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    cardElsRef.current.forEach((el) => {
      left = Math.min(left, el.offsetLeft)
      top = Math.min(top, el.offsetTop)
      right = Math.max(right, el.offsetLeft + el.offsetWidth)
      bottom = Math.max(bottom, el.offsetTop + el.offsetHeight)
    })
    groupElsRef.current.forEach((el) => {
      left = Math.min(left, el.offsetLeft)
      top = Math.min(top, el.offsetTop)
      right = Math.max(right, el.offsetLeft + el.offsetWidth)
      bottom = Math.max(bottom, el.offsetTop + el.offsetHeight)
    })
    if (!Number.isFinite(left)) return

    const rect = boardElRef.current.getBoundingClientRect()
    const contentWidth = Math.max(1, right - left)
    const contentHeight = Math.max(1, bottom - top)
    const fitZoom = Math.min(
      (rect.width - FIT_PADDING * 2) / contentWidth,
      (rect.height - FIT_PADDING * 2) / contentHeight,
    )
    const newZoom = clamp(Math.min(fitZoom, 1), MIN_ZOOM, MAX_ZOOM)

    const worldCenterX = (left + right) / 2
    const worldCenterY = (top + bottom) / 2
    const anchorX = rect.width / 2
    const anchorY = rect.height / 2
    setView({ zoom: newZoom, x: anchorX - worldCenterX * newZoom, y: anchorY - worldCenterY * newZoom })
  }

  // World-space bounding box for a card or group, whichever it is — same
  // DOM-measured box used for the selection-menu anchor above.
  // x/y/w come from board data whenever possible rather than the DOM — a
  // card's rendered box only catches up to a data change (e.g. toggling
  // text size, which changes both w and h) one render later, which made
  // things anchored to it (arrows, the selection menu) visibly lag behind
  // for a frame. A regular note's height is the one thing genuinely not in
  // the data (it grows with content), so that alone still comes from the DOM.
  function getNodeBox(id) {
    const card = board.cards.find((c) => c.id === id)
    if (card) {
      const isBig = card.textSize === 'big'
      const height = isBig ? card.h : (cardElsRef.current.get(id)?.offsetHeight ?? 0)
      return { left: card.x, top: card.y, width: card.w, height }
    }
    const group = board.groups.find((g) => g.id === id)
    if (group) return { left: group.x, top: group.y, width: group.w, height: group.h }
    return null
  }

  // Both endpoints for a persisted edge — always the sides stored on it,
  // chosen once by the user when they drew the connection and never
  // recomputed, so it can deliberately keep a "wrong-looking" side and bend
  // around rather than snap back to the geometrically shortest path.
  function computeEdgeEndpoints(edge) {
    const boxA = getNodeBox(edge.fromId)
    const boxB = getNodeBox(edge.toId)
    if (!boxA || !boxB) return null
    // Edges saved before sides were stored fall back to the old
    // auto-picked side rather than anchoring at a dead center.
    const sideA = edge.fromSide ?? bestSide(boxA, boxCenter(boxB))
    const sideB = edge.toSide ?? bestSide(boxB, boxCenter(boxA))
    return { pA: anchorPoint(boxA, sideA), sideA, pB: anchorPoint(boxB, sideB), sideB }
  }

  // Which side of node `id` is nearest `worldPoint` — used so hovering or
  // dropping anywhere in the general area of a side picks it, rather than
  // requiring a precise hit on the small connector dot.
  function sideNearPoint(id, worldPoint) {
    const box = getNodeBox(id)
    if (!box) return null
    return bestSide(box, worldPoint)
  }

  // Every group's top-edge "no-fly zone": its drag handle plus a grid cell
  // of breathing room below, and a matching grid cell of breathing room
  // above. A note's snapped position — whether dragged or freshly created —
  // never ends up straddling this band while horizontally overlapping the
  // group, but placing one above the border entirely is still fine.
  function getGroupExclusions() {
    return board.groups.map((g) => ({
      left: g.x,
      right: g.x + g.w,
      top: g.y,
      zoneAbove: g.y - GRID_SIZE * 2,
      zoneBelow: g.y + GRID_SIZE * 2,
    }))
  }

  // Shared by double-click creation and pasting text from the system
  // clipboard (see useImperativeHandle below) — keeps a new card clear of
  // any group's no-fly zone the same way either path creates one.
  function createCardAt(worldX, worldY, content) {
    const worldYClamped = clampYForGroupExclusions(
      worldX,
      CARD_WIDTH,
      NEW_CARD_HEIGHT_ESTIMATE,
      worldY,
      getGroupExclusions(),
    )
    onCreateCard?.(worldX, worldYClamped, content)
  }

  // Same idea as createCardAt, for an image dropped/pasted onto blank
  // canvas rather than typed text — height isn't known up front (the image
  // hasn't rendered yet), so the no-fly-zone clamp still uses the same
  // rough estimate NEW_CARD_HEIGHT_ESTIMATE stands in for elsewhere.
  function createImageCardAt(worldX, worldY, dataUri) {
    const worldYClamped = clampYForGroupExclusions(
      worldX,
      CARD_WIDTH,
      NEW_CARD_HEIGHT_ESTIMATE,
      worldY,
      getGroupExclusions(),
    )
    onCreateImageCard?.(worldX, worldYClamped, dataUri)
  }

  // Same idea again, for a link pasted onto blank canvas — a link node is
  // the same fixed width/rough-height shape as a regular note for placement
  // purposes.
  function createLinkCardAt(worldX, worldY, url) {
    const worldYClamped = clampYForGroupExclusions(
      worldX,
      CARD_WIDTH,
      NEW_CARD_HEIGHT_ESTIMATE,
      worldY,
      getGroupExclusions(),
    )
    onCreateLinkCard?.(worldX, worldYClamped, url)
  }

  useImperativeHandle(ref, () => ({
    // Cmd/Ctrl+V with nothing selected and system-clipboard text available
    // (see App.jsx) creates a note from it, centered in the current
    // viewport — the pan/zoom state needed for that only exists in here.
    pasteTextAsCard(content) {
      const rect = boardElRef.current?.getBoundingClientRect()
      if (!rect) return
      const worldX = (rect.width / 2 - view.x) / view.zoom
      const worldY = (rect.height / 2 - view.y) / view.zoom
      createCardAt(worldX, worldY, content)
    },
    // Same, for an image pasted with nothing selected.
    pasteImageAsCard(dataUri) {
      const rect = boardElRef.current?.getBoundingClientRect()
      if (!rect) return
      const worldX = (rect.width / 2 - view.x) / view.zoom
      const worldY = (rect.height / 2 - view.y) / view.zoom
      createImageCardAt(worldX, worldY, dataUri)
    },
    // Same, for a link pasted with nothing selected.
    pasteLinkAsCard(url) {
      const rect = boardElRef.current?.getBoundingClientRect()
      if (!rect) return
      const worldX = (rect.width / 2 - view.x) / view.zoom
      const worldY = (rect.height / 2 - view.y) / view.zoom
      createLinkCardAt(worldX, worldY, url)
    },
    // After an in-app node paste (see App.jsx) — pans (without changing
    // zoom) so `box` (a world-space rect) is fully back in view, but only
    // if it isn't already: a paste that landed somewhere already visible
    // shouldn't yank the viewport around for no reason.
    panIntoView(box) {
      if (!box) return
      const rect = boardElRef.current?.getBoundingClientRect()
      if (!rect) return
      setView((v) => {
        const screenLeft = box.left * v.zoom + v.x
        const screenTop = box.top * v.zoom + v.y
        const screenRight = (box.left + box.width) * v.zoom + v.x
        const screenBottom = (box.top + box.height) * v.zoom + v.y
        const fullyVisible = screenLeft >= 0 && screenTop >= 0 && screenRight <= rect.width && screenBottom <= rect.height
        if (fullyVisible) return v

        const worldCenterX = box.left + box.width / 2
        const worldCenterY = box.top + box.height / 2
        const anchorX = rect.width / 2
        const anchorY = rect.height / 2
        return { ...v, x: anchorX - worldCenterX * v.zoom, y: anchorY - worldCenterY * v.zoom }
      })
    },
  }))

  function getSiblingRects(excludeIds) {
    const excludeSet = excludeIds instanceof Set ? excludeIds : new Set(excludeIds)
    const rects = []
    cardElsRef.current.forEach((el, id) => {
      if (excludeSet.has(id)) return
      rects.push({ x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight })
    })
    return rects
  }

  // When dragging a card or group that's part of a multi-selection, every
  // other selected card/group should ride along, keeping their relative
  // layout — regardless of which kind of item is being dragged.
  function getSelectionOrigins(id) {
    if (!selectedIds.has(id) || selectedIds.size <= 1) return []
    const others = []
    board.cards.forEach((c) => {
      if (c.id !== id && selectedIds.has(c.id)) others.push({ id: c.id, x: c.x, y: c.y })
    })
    board.groups.forEach((g) => {
      if (g.id !== id && selectedIds.has(g.id)) others.push({ id: g.id, x: g.x, y: g.y })
    })
    return others
  }

  // Dragging a grouping box also carries along whatever it visually
  // overlaps (fully or partially) at the moment the drag starts — there's
  // no formal ownership, just a bounding-box overlap test against every
  // other card/group, so anything sitting on/across the group rides along.
  //
  // A plain overlap test is symmetric, though: a bigger group that fully
  // encloses the one being dragged "overlaps" it just as much as a true
  // descendant does. Only descendants should move — an enclosing group is
  // an ancestor and must never get dragged along — so those are filtered
  // out explicitly.
  function getContainedOrigins(groupId) {
    const groupBox = getNodeBox(groupId)
    if (!groupBox) return []
    const overlaps = (box) =>
      box.left < groupBox.left + groupBox.width &&
      box.left + box.width > groupBox.left &&
      box.top < groupBox.top + groupBox.height &&
      box.top + box.height > groupBox.top
    const fullyEncloses = (box) =>
      box.left <= groupBox.left &&
      box.top <= groupBox.top &&
      box.left + box.width >= groupBox.left + groupBox.width &&
      box.top + box.height >= groupBox.top + groupBox.height
    const contained = []
    board.cards.forEach((c) => {
      const box = getNodeBox(c.id)
      if (box && overlaps(box)) contained.push({ id: c.id, x: c.x, y: c.y })
    })
    board.groups.forEach((g) => {
      if (g.id === groupId) return
      const box = getNodeBox(g.id)
      if (box && overlaps(box) && !fullyEncloses(box)) contained.push({ id: g.id, x: g.x, y: g.y })
    })
    return contained
  }

  // What a group's drag should carry: spatially-contained items (always)
  // plus multi-selection siblings (only when the group is part of one),
  // merged so nothing rides along twice.
  function getGroupDragOrigins(groupId) {
    const merged = new Map()
    getContainedOrigins(groupId).forEach((o) => merged.set(o.id, o))
    getSelectionOrigins(groupId).forEach((o) => merged.set(o.id, o))
    return [...merged.values()]
  }

  // Dispatches a move to whichever action the item's type needs — lets one
  // drag gesture carry along a mixed selection of cards and groups.
  function moveItem(id, x, y) {
    if (board.cards.some((c) => c.id === id)) actions.moveCard(id, x, y)
    else actions.updateGroup(id, { x, y })
  }

  function handleSelect(id, additive) {
    onSelectionChange((prev) => {
      if (additive) {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }
      // Clicking (without dragging) a card that's already part of a
      // multi-selection keeps the group intact, so it can be dragged as one.
      if (prev.has(id) && prev.size > 1) return prev
      return new Set([id])
    })
  }

  // Every group whose bounds contain (worldX, worldY), innermost (smallest
  // area) first. Geometric rather than DOM-hit-testing (`e.target.closest`)
  // on purpose: groups are plain siblings in the DOM, not actually nested,
  // so which one "wins" a click there depends on paint order (whichever is
  // later in board.groups paints on top) — which has nothing to do with
  // visual nesting depth, and can easily resolve to an enclosing group
  // instead of the specific one actually clicked. This instead always
  // finds the true containment chain, however many levels deep it goes.
  function groupsContainingPoint(worldX, worldY) {
    return board.groups
      .filter((g) => worldX >= g.x && worldX <= g.x + g.w && worldY >= g.y && worldY <= g.y + g.h)
      .sort((a, b) => a.w * a.h - b.w * b.h)
  }

  function handlePointerDown(e) {
    if (helpOpen) {
      // Clicking anywhere outside the panel (the backdrop) just dismisses
      // it — don't also treat that click as a canvas interaction.
      if (!e.target.closest('.board__help') && !e.target.closest('.help-panel')) {
        setHelpOpen(false)
      }
      return
    }
    if (e.button === 2) {
      e.preventDefault()
      panRef.current = { startX: e.clientX, startY: e.clientY, originX: view.x, originY: view.y }
      setPanning(true)
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0) return
    if (
      e.target.closest('.selection-menu') ||
      e.target.closest('.board__zoom') ||
      e.target.closest('.board__help')
    ) {
      return
    }
    const connectorEl = e.target.closest('.node-connector')
    if (connectorEl) {
      const rect = boardElRef.current.getBoundingClientRect()
      const worldX = (e.clientX - rect.left - view.x) / view.zoom
      const worldY = (e.clientY - rect.top - view.y) / view.zoom
      connectingRef.current = { fromId: connectorEl.dataset.nodeId, fromSide: connectorEl.dataset.side }
      setConnectingPreview({ x: worldX, y: worldY })
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+drag draws a new grouping box, even when it starts on top
      // of an existing card or group (both bail out of their own pointer
      // handling in that case so this gesture always wins) — but Cmd/Ctrl
      // +click (no drag) on a card/group instead toggles it in the
      // selection; see which branch handlePointerUp takes.
      const clickCardEl = e.target.closest('.card')
      const rect = boardElRef.current.getBoundingClientRect()
      const worldX = (e.clientX - rect.left - view.x) / view.zoom
      const worldY = (e.clientY - rect.top - view.y) / view.zoom
      creatingGroupRef.current = {
        startScreenX: e.clientX - rect.left,
        startScreenY: e.clientY - rect.top,
        moved: false,
        clickNodeId: clickCardEl?.dataset.nodeId ?? groupsContainingPoint(worldX, worldY)[0]?.id ?? null,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    // A group's body (unlike a card) isn't its own drag surface — only its
    // top handle bar is — so dragging here falls through to the normal
    // marquee, letting you select notes sitting inside the border. A plain
    // click (no drag) still selects the group itself; see handlePointerUp.
    if (e.target.closest('.card') || e.target.closest('.group__drag-handle') || e.target.closest('.edge')) return
    const rect = boardElRef.current.getBoundingClientRect()
    const worldX = (e.clientX - rect.left - view.x) / view.zoom
    const worldY = (e.clientY - rect.top - view.y) / view.zoom
    // Every group the drag started inside of, not just the innermost one —
    // a marquee drawn inside a nested group is, geometrically, also inside
    // every group that encloses it, so all of them need to be excluded
    // below (see clickGroupIds) or an enclosing group gets trivially swept
    // into the selection just for sharing the same space.
    const containingGroups = groupsContainingPoint(worldX, worldY)
    marqueeRef.current = {
      startScreenX: e.clientX - rect.left,
      startScreenY: e.clientY - rect.top,
      baseSelection: e.shiftKey ? new Set(selectedIds) : new Set(),
      moved: false,
      // The innermost one — for a plain click (no real drag), that's the
      // single group that actually gets selected.
      clickGroupId: containingGroups[0]?.id ?? null,
      clickGroupIds: new Set(containingGroups.map((g) => g.id)),
      shiftKey: e.shiftKey,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e) {
    if (connectingRef.current) {
      const rect = boardElRef.current.getBoundingClientRect()
      const worldX = (e.clientX - rect.left - view.x) / view.zoom
      const worldY = (e.clientY - rect.top - view.y) / view.zoom
      // While hovering anywhere over a *different* node's body, snap the
      // preview to whichever side is nearest the cursor — no need to land
      // on the small connector dot precisely.
      const hoverNodeEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card, .group')
      const fromId = connectingRef.current.fromId
      let hoverId = null
      let hoverSide = null
      if (hoverNodeEl && hoverNodeEl.dataset.nodeId !== fromId) {
        hoverId = hoverNodeEl.dataset.nodeId
        hoverSide = sideNearPoint(hoverId, { x: worldX, y: worldY })
      }
      setConnectingPreview({ x: worldX, y: worldY, hoverId, hoverSide })
      return
    }

    if (creatingGroupRef.current) {
      const rect = boardElRef.current.getBoundingClientRect()
      const curScreenX = e.clientX - rect.left
      const curScreenY = e.clientY - rect.top
      const { startScreenX, startScreenY } = creatingGroupRef.current

      const x = Math.min(startScreenX, curScreenX)
      const y = Math.min(startScreenY, curScreenY)
      const w = Math.abs(curScreenX - startScreenX)
      const h = Math.abs(curScreenY - startScreenY)
      if (w > MARQUEE_DRAG_THRESHOLD || h > MARQUEE_DRAG_THRESHOLD) creatingGroupRef.current.moved = true
      setCreatingGroupRect({ x, y, w, h })
      return
    }

    if (marqueeRef.current) {
      const rect = boardElRef.current.getBoundingClientRect()
      const curScreenX = e.clientX - rect.left
      const curScreenY = e.clientY - rect.top
      const { startScreenX, startScreenY, baseSelection, clickGroupIds } = marqueeRef.current

      const x = Math.min(startScreenX, curScreenX)
      const y = Math.min(startScreenY, curScreenY)
      const w = Math.abs(curScreenX - startScreenX)
      const h = Math.abs(curScreenY - startScreenY)
      if (w > MARQUEE_DRAG_THRESHOLD || h > MARQUEE_DRAG_THRESHOLD) marqueeRef.current.moved = true
      setMarqueeRect({ x, y, w, h })

      const worldX1 = (x - view.x) / view.zoom
      const worldY1 = (y - view.y) / view.zoom
      const worldX2 = (x + w - view.x) / view.zoom
      const worldY2 = (y + h - view.y) / view.zoom

      const hits = new Set(baseSelection)
      const testOverlap = (el, id) => {
        const left = el.offsetLeft
        const top = el.offsetTop
        const overlaps =
          left < worldX2 && left + el.offsetWidth > worldX1 && top < worldY2 && top + el.offsetHeight > worldY1
        if (overlaps) hits.add(id)
      }
      cardElsRef.current.forEach(testOverlap)
      // A drag that starts inside a group's body never selects that group,
      // *or any group enclosing it* — every one of them is a container the
      // drag is happening "within", so all of them would otherwise end up
      // selected just by virtue of the marquee starting inside them (an
      // enclosing group's bounds trivially contain the marquee rectangle
      // no matter how it's dragged). Any *other* group the rectangle
      // actually sweeps over — a nested child border elsewhere, say — is
      // still fair game, same as notes.
      groupElsRef.current.forEach((el, id) => {
        if (clickGroupIds.has(id)) return
        testOverlap(el, id)
      })
      onSelectionChange(hits)
      return
    }

    if (!panRef.current) return
    const { startX, startY, originX, originY } = panRef.current
    const x = originX + (e.clientX - startX)
    const y = originY + (e.clientY - startY)
    setView((v) => ({ ...v, x, y }))
  }

  function handlePointerUp(e) {
    if (connectingRef.current) {
      const { fromId, fromSide } = connectingRef.current
      connectingRef.current = null
      setConnectingPreview(null)
      // Dropping anywhere on the target's body picks whichever side is
      // nearest the drop point — same forgiving hit area as the hover preview.
      const rect = boardElRef.current.getBoundingClientRect()
      const worldX = (e.clientX - rect.left - view.x) / view.zoom
      const worldY = (e.clientY - rect.top - view.y) / view.zoom
      const nodeEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card, .group')
      let toId = null
      let toSide = null
      if (nodeEl && nodeEl.dataset.nodeId !== fromId) {
        toId = nodeEl.dataset.nodeId
        toSide = sideNearPoint(toId, { x: worldX, y: worldY })
      }
      if (toId && toSide) onCreateEdge?.(fromId, fromSide, toId, toSide)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      return
    }

    if (creatingGroupRef.current) {
      const { moved, clickNodeId } = creatingGroupRef.current
      const finalRect = creatingGroupRect
      creatingGroupRef.current = null
      setCreatingGroupRect(null)
      if (moved && finalRect) {
        onCreateGroup?.({
          x: (finalRect.x - view.x) / view.zoom,
          y: (finalRect.y - view.y) / view.zoom,
          w: finalRect.w / view.zoom,
          h: finalRect.h / view.zoom,
        })
      } else if (clickNodeId) {
        // A Cmd/Ctrl+click (no drag) on a card/group toggles it in the
        // selection instead — the "always wins" drag-to-create-a-group
        // gesture only actually applies once it becomes a real drag.
        handleSelect(clickNodeId, true)
      }
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      return
    }

    if (marqueeRef.current) {
      const { moved, clickGroupId, shiftKey, startScreenX, startScreenY } = marqueeRef.current
      marqueeRef.current = null
      setMarqueeRect(null)
      if (!moved) {
        // Our own double-click detection, tighter than the browser's native
        // dblclick threshold (which felt like it fired even on two fairly
        // deliberate, separated clicks) — a second click has to land within
        // DOUBLE_CLICK_MS and DOUBLE_CLICK_DIST of the first to count.
        const now = performance.now()
        const last = lastClickRef.current
        const isDoubleClick =
          now - last.time < DOUBLE_CLICK_MS && Math.hypot(startScreenX - last.x, startScreenY - last.y) < DOUBLE_CLICK_DIST
        if (isDoubleClick) {
          lastClickRef.current = { time: -Infinity, x: 0, y: 0 }
          const worldX = (startScreenX - view.x) / view.zoom
          const worldY = (startScreenY - view.y) / view.zoom
          createCardAt(worldX, worldY)
        } else {
          lastClickRef.current = { time: now, x: startScreenX, y: startScreenY }
          // A plain click (no drag) that started on a group's body selects
          // that group, same as clicking a card — only an actual drag turns
          // into a marquee over the notes inside it.
          if (clickGroupId) handleSelect(clickGroupId, shiftKey)
          else onSelectionChange(new Set())
        }
      }
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      return
    }

    if (!panRef.current) return
    panRef.current = null
    setPanning(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  // One shared menu for the whole selection, however it's made up — anchor
  // to the bounding box of every selected card *and* group together, so
  // mixed selections get a single menu instead of one per type.
  const selectedCards = board.cards.filter((c) => selectedIds.has(c.id))
  const selectedGroups = board.groups.filter((g) => selectedIds.has(g.id))

  // Anchored from board data (x/y/w), not the DOM — a card's rendered box
  // only catches up to a size change (e.g. toggling text size) one render
  // after the data does, which made the menu visibly jump to the stale
  // position for a frame before snapping to the new one.
  let selectionMenuAnchor = null
  if (selectedIds.size > 0) {
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    for (const item of [...selectedCards, ...selectedGroups]) {
      left = Math.min(left, item.x)
      top = Math.min(top, item.y)
      right = Math.max(right, item.x + item.w)
    }
    if (Number.isFinite(left)) selectionMenuAnchor = { left: right + GRID_SIZE, top }
  }

  const selectedColors = new Set([...selectedCards, ...selectedGroups].map((item) => item.color))
  const commonColor = selectedColors.size === 1 ? [...selectedColors][0] : null

  const selectedPatterns = new Set(selectedGroups.map((g) => g.pattern))
  const commonPattern = selectedPatterns.size === 1 ? [...selectedPatterns][0] : null

  // Color applies to every selected item regardless of type; pattern only
  // makes sense for groups, so cards in the selection are left alone.
  function handleColorPick(name) {
    selectedCards.forEach((c) => actions.updateCard(c.id, { color: name }))
    selectedGroups.forEach((g) => actions.updateGroup(g.id, { color: name }))
  }

  function handlePatternPick(key) {
    selectedGroups.forEach((g) => actions.updateGroup(g.id, { pattern: key }))
  }

  const selectedTextSizes = new Set(selectedCards.map((c) => c.textSize ?? DEFAULT_TEXT_SIZE))
  const commonTextSize = selectedTextSizes.size === 1 ? [...selectedTextSizes][0] : null

  function handleTextSizePick(size) {
    selectedCards.forEach((c) => {
      if ((c.textSize ?? DEFAULT_TEXT_SIZE) === size) return
      if (size === 'big') {
        actions.updateCard(c.id, { textSize: 'big', w: BIG_TEXT_DEFAULT_W, h: BIG_TEXT_DEFAULT_H })
      } else {
        actions.updateCard(c.id, { textSize: 'regular', w: CARD_WIDTH, h: undefined })
      }
    })
  }

  // Any card or group (of any kind — text, image, link, or a grouping box)
  // can optionally also be a task. "Default vs. Task" is its own toggle,
  // shared by every selected item regardless of type; the four-status
  // picker only shows once every selected item already is one.
  const selectedTaskItems = [...selectedCards, ...selectedGroups]
  const selectedTaskKinds = new Set(selectedTaskItems.map((item) => (item.taskStatus ? 'task' : 'default')))
  const commonTaskKind = selectedTaskKinds.size === 1 ? [...selectedTaskKinds][0] : null
  const allSelectedAreTasks = selectedTaskItems.length > 0 && selectedTaskItems.every((item) => item.taskStatus)
  const selectedTaskStatuses = new Set(selectedTaskItems.map((item) => item.taskStatus).filter(Boolean))
  const commonTaskStatus = selectedTaskStatuses.size === 1 ? [...selectedTaskStatuses][0] : null

  function handleTaskKindPick(kind) {
    // Turning an already-task item "back on" leaves its existing status
    // alone rather than resetting it to 'to do' — this only ever adds or
    // removes the taskStatus field, never overwrites one that's already set.
    selectedTaskItems.forEach((item) => {
      if (kind === 'task' && item.taskStatus) return
      if (kind === 'default' && !item.taskStatus) return
      const patch = { taskStatus: kind === 'task' ? DEFAULT_TASK_STATUS : undefined }
      if (board.cards.some((c) => c.id === item.id)) actions.updateCard(item.id, patch)
      else actions.updateGroup(item.id, patch)
    })
  }

  function handleTaskStatusPick(status) {
    selectedCards.forEach((c) => actions.updateCard(c.id, { taskStatus: status }))
    selectedGroups.forEach((g) => actions.updateGroup(g.id, { taskStatus: status }))
  }

  // Selected edges get their own small direction-picker menu, anchored to
  // the midpoint of the first selected edge.
  const selectedEdges = board.edges.filter((ed) => selectedIds.has(ed.id))
  const selectedDirections = new Set(selectedEdges.map((ed) => ed.direction))
  const commonDirection = selectedDirections.size === 1 ? [...selectedDirections][0] : null

  let edgeMenuAnchor = null
  if (selectedEdges.length > 0) {
    const pts = computeEdgeEndpoints(selectedEdges[0])
    if (pts) {
      edgeMenuAnchor = { left: (pts.pA.x + pts.pB.x) / 2 + GRID_SIZE, top: (pts.pA.y + pts.pB.y) / 2 }
    }
  }

  function handleDirectionPick(direction) {
    selectedEdges.forEach((ed) => actions.updateEdge(ed.id, { direction }))
  }

  function handleDragOver(e) {
    // Whether the drag is actually an image is only knowable at drop time
    // (dataTransfer.files isn't populated until then) — files-of-some-kind
    // is the most that's checkable here, so this just has to preventDefault
    // liberally enough to allow the drop through.
    if (dataTransferHasFiles(e.dataTransfer)) e.preventDefault()
  }

  async function handleDrop(e) {
    // Only onto truly blank canvas or a group's blank area — same as
    // pasting an image with nothing/a non-card selected, dropping onto an
    // existing note isn't handled (that's what pasting *while editing that
    // note* is for).
    if (e.target.closest('.card')) return
    const files = getImageFilesFromDataTransfer(e.dataTransfer)
    if (files.length === 0) return
    e.preventDefault()
    const rect = boardElRef.current.getBoundingClientRect()
    const worldX = (e.clientX - rect.left - view.x) / view.zoom
    const worldY = (e.clientY - rect.top - view.y) / view.zoom
    try {
      const { dataUri } = await processImageFile(files[0])
      createImageCardAt(worldX, worldY, dataUri)
    } catch {
      // Unreadable/corrupt file — no-op.
    }
  }

  return (
    <div
      ref={boardElRef}
      className={`board${panning ? ' board--panning' : ''}`}
      style={{
        backgroundPosition: `${view.x}px ${view.y}px`,
        backgroundSize: `${GRID_SIZE * view.zoom}px ${GRID_SIZE * view.zoom}px`,
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        className="board__layer"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
      >
        {/* Groups render first so cards always paint on top of them (plain
            DOM order — neither layer sets a z-index that could invert this). */}
        {board.groups.map((group) => (
          <Group
            key={group.id}
            group={group}
            zoom={view.zoom}
            theme={theme}
            viewMode={viewMode}
            selected={selectedIds.has(group.id)}
            connectTarget={connectingPreview?.hoverId === group.id}
            connectHoverSide={connectingPreview?.hoverId === group.id ? connectingPreview.hoverSide : null}
            onSelect={(additive) => handleSelect(group.id, additive)}
            onMove={moveItem}
            onResize={(id, patch) => actions.updateGroup(id, patch)}
            getSelectionOrigins={getGroupDragOrigins}
            registerRef={(el) => {
              if (el) groupElsRef.current.set(group.id, el)
              else groupElsRef.current.delete(group.id)
            }}
          />
        ))}

        {/* Edges render above group backgrounds but below cards, so a card
            still visually "sits on top of" the connections touching it. */}
        <svg className="board__edges">
          <defs>
            {/* The regular arrowhead, plus a selected variant — a shared
                <marker> can't be reached by a CSS selector from the <g>
                that references it, so each needs its own marker def rather
                than being styled dynamically. */}
            <marker
              id="edge-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 Z" fill={EDGE_COLOR} />
            </marker>
            <marker
              id="edge-arrow-selected"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 Z" className="edge__arrowhead--selected" />
            </marker>
          </defs>
          {board.edges.map((edge) => {
            const pts = computeEdgeEndpoints(edge)
            if (!pts) return null
            return (
              <Edge
                key={edge.id}
                edge={edge}
                d={curvedPath(edge.id, pts.pA, pts.sideA, pts.pB, pts.sideB)}
                selected={selectedIds.has(edge.id)}
                onSelect={(additive) => handleSelect(edge.id, additive)}
              />
            )
          })}
          {connectingRef.current &&
            connectingPreview &&
            (() => {
              const { fromId, fromSide } = connectingRef.current
              const boxA = getNodeBox(fromId)
              if (!boxA) return null
              const pA = anchorPoint(boxA, fromSide)
              // Hovering a target's body previews the side nearest the
              // cursor, matching exactly what dropping here would create.
              if (connectingPreview.hoverId && connectingPreview.hoverSide) {
                const boxB = getNodeBox(connectingPreview.hoverId)
                if (boxB) {
                  const pB = anchorPoint(boxB, connectingPreview.hoverSide)
                  return (
                    <path
                      className="board__edge-preview"
                      d={curvedPath('preview', pA, fromSide, pB, connectingPreview.hoverSide)}
                    />
                  )
                }
              }
              return (
                <path className="board__edge-preview" d={curvedPath('preview', pA, fromSide, connectingPreview)} />
              )
            })()}
        </svg>

        {board.cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            imageSrc={card.imageId ? board.images[card.imageId] : undefined}
            zoom={view.zoom}
            theme={theme}
            viewMode={viewMode}
            selected={selectedIds.has(card.id)}
            connectTarget={connectingPreview?.hoverId === card.id}
            connectHoverSide={connectingPreview?.hoverId === card.id ? connectingPreview.hoverSide : null}
            autoFocus={card.id === focusCardId}
            onSelect={(additive) => handleSelect(card.id, additive)}
            onMove={moveItem}
            onUpdate={actions.updateCard}
            onSlurpLink={onSlurpLink}
            getSiblingRects={getSiblingRects}
            getSelectionOrigins={getSelectionOrigins}
            getGroupExclusions={getGroupExclusions}
            registerRef={(el) => {
              if (el) {
                cardElsRef.current.set(card.id, el)
                cardResizeObserverRef.current?.observe(el)
              } else {
                cardElsRef.current.delete(card.id)
              }
            }}
          />
        ))}

        {selectionMenuAnchor && (
          <div className="selection-menu" style={{ left: selectionMenuAnchor.left, top: selectionMenuAnchor.top }}>
            <div className="selection-menu__grid">
              {Object.keys(COLORS).map((name) => (
                <button
                  key={name}
                  className={`swatch${commonColor === name ? ' swatch--active' : ''}`}
                  style={{ background: swatchBackground(name) }}
                  title={name}
                  onClick={() => handleColorPick(name)}
                />
              ))}
            </div>

            {selectedGroups.length > 0 && (
              <>
                <div className="selection-menu__divider" />
                <div className="selection-menu__grid">
                  {Object.entries(PATTERNS).map(([key, { label, fn }]) => (
                    <button
                      key={key}
                      className={`pattern-swatch${commonPattern === key ? ' pattern-swatch--active' : ''}`}
                      style={{
                        // Patterns are always this fixed neutral — see
                        // Group.jsx — never the group's own accent color.
                        backgroundImage: fn ? fn(COLORS.gray, 1) : undefined,
                      }}
                      title={label}
                      onClick={() => handlePatternPick(key)}
                    />
                  ))}
                </div>
              </>
            )}

            {selectedCards.length > 0 && !selectedCards.some((c) => c.imageId || c.linkUrl) && (
              <>
                <div className="selection-menu__divider" />
                <div className="selection-menu__grid">
                  <button
                    className={`textsize-swatch${commonTextSize === 'regular' ? ' textsize-swatch--active' : ''}`}
                    title="Regular text"
                    onClick={() => handleTextSizePick('regular')}
                  >
                    <Type size={14} strokeWidth={2} />
                  </button>
                  <button
                    className={`textsize-swatch${commonTextSize === 'big' ? ' textsize-swatch--active' : ''}`}
                    title="Big text"
                    onClick={() => handleTextSizePick('big')}
                  >
                    <Heading1 size={14} strokeWidth={2} />
                  </button>
                </div>
              </>
            )}

            {/* Default vs. task — any card or group, of any kind, can be
                made a task. */}
            <div className="selection-menu__divider" />
            <div className="selection-menu__grid">
              <button
                className={`task-swatch${commonTaskKind === 'default' ? ' task-swatch--active' : ''}`}
                title="Default"
                onClick={() => handleTaskKindPick('default')}
              >
                <List size={14} strokeWidth={2} />
              </button>
              <button
                className={`task-swatch${commonTaskKind === 'task' ? ' task-swatch--active' : ''}`}
                title="Task"
                onClick={() => handleTaskKindPick('task')}
              >
                <ListTodo size={14} strokeWidth={2} />
              </button>
            </div>

            {/* Status only once every selected item is already a task. */}
            {allSelectedAreTasks && (
              <>
                <div className="selection-menu__divider" />
                <div className="selection-menu__grid">
                  {TASK_STATUSES.map((status) => (
                    <button
                      key={status}
                      className={`task-swatch${commonTaskStatus === status ? ' task-swatch--active' : ''}`}
                      title={status.replace('_', ' ')}
                      onClick={() => handleTaskStatusPick(status)}
                    >
                      <TaskStatusIcon status={status} theme={theme} size={14} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {edgeMenuAnchor && (
          <div className="selection-menu edge-menu" style={{ left: edgeMenuAnchor.left, top: edgeMenuAnchor.top }}>
            <div className="selection-menu__grid">
              <button
                className={`edge-menu__btn${commonDirection === 'none' ? ' edge-menu__btn--active' : ''}`}
                title="No arrow"
                onClick={() => handleDirectionPick('none')}
              >
                —
              </button>
              <button
                className={`edge-menu__btn${commonDirection === 'forward' ? ' edge-menu__btn--active' : ''}`}
                title="Arrow forward"
                onClick={() => handleDirectionPick('forward')}
              >
                →
              </button>
              <button
                className={`edge-menu__btn${commonDirection === 'backward' ? ' edge-menu__btn--active' : ''}`}
                title="Arrow backward"
                onClick={() => handleDirectionPick('backward')}
              >
                ←
              </button>
            </div>
          </div>
        )}
      </div>

      {marqueeRect && (
        <div
          className="board__marquee"
          style={{ left: marqueeRect.x, top: marqueeRect.y, width: marqueeRect.w, height: marqueeRect.h }}
        />
      )}

      {creatingGroupRect && (
        <div
          className="board__group-preview"
          style={{
            left: creatingGroupRect.x,
            top: creatingGroupRect.y,
            width: creatingGroupRect.w,
            height: creatingGroupRect.h,
          }}
        />
      )}

      <button
        className="board__zoom-btn board__help"
        onClick={() => setHelpOpen((v) => !v)}
        title="Keyboard shortcuts"
      >
        <CircleHelp size={16} strokeWidth={2} />
      </button>

      {helpOpen && (
        <div className="help-backdrop">
          <div className="help-panel">
            <h2 className="help-panel__title">Keyboard shortcuts</h2>
            <table className="help-panel__table">
              <tbody>
                {SHORTCUTS.map(([key, desc]) => (
                  <tr key={key}>
                    <td className="help-panel__key">{key}</td>
                    <td>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="board__zoom">
        <button className="board__zoom-btn" onClick={() => zoomByButton(1 / ZOOM_BUTTON_STEP)} title="Zoom out">
          <ZoomOut size={16} strokeWidth={2} />
        </button>
        <button className="board__zoom-btn board__zoom-btn--reset" onClick={resetZoom} title="Reset zoom">
          {Math.round(view.zoom * 100)}%
        </button>
        <button className="board__zoom-btn" onClick={() => zoomByButton(ZOOM_BUTTON_STEP)} title="Zoom in">
          <ZoomIn size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
})

export default Board
