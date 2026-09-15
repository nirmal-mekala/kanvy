// Selection, dragging, resizing, marquee-select, and Ctrl/Cmd+drag
// container creation (spec §4.3, §4.4, §4.5) — extracted out of Canvas.tsx
// to keep that component's cognitive complexity manageable. Ported from
// the prototype's Board.jsx/Card.jsx/Group.jsx pointer-event dance, but
// re-derives container membership from the formal `parentId` relationship
// (spec §2.3) rather than a spatial overlap test performed at drag-start.

import { useAtomValue, useSetAtom } from 'jotai'
import type { RefObject } from 'react'
import { useMemo, useRef, useState } from 'react'
import { computeParentIdOnDrop } from '../../containers/assignParent'
import { createContainer } from '../../containers/createContainer'
import { getDescendantIds } from '../../containers/descendants'
import {
  BIG_TEXT_MIN_H,
  BIG_TEXT_MIN_W,
  CONTAINER_MIN_H,
  CONTAINER_MIN_W,
  snapSize,
} from '../../geometry/constants'
import { clampOutOfNoFlyZone, isInNoFlyZone } from '../../geometry/noFlyZone'
import {
  GRID_SIZE,
  type Rect,
  snapToGridMidpoint,
  snapY,
} from '../../geometry/snap'
import type { CardNode, ContainerNode, Node, NodeId } from '../../schema/node'
import {
  addNodeAtom,
  moveNodesAtom,
  setParentIdAtom,
  updateNodeAtom,
} from '../../state/atoms/nodes'
import {
  clearSelectionAtom,
  computeSelectionAfterClick,
  selectionAtom,
  setSelectionAtom,
} from '../../state/atoms/selection'
import { screenPoint, worldPoint } from './viewportCoords'

/** Matches `.container-node__drag-handle`'s `min-height` (spec §4.4's no-fly-zone band). */
const CONTAINER_HANDLE_HEIGHT = GRID_SIZE

/** Below this screen-space movement, a drag gesture counts as a plain click instead (matches the prototype's `MARQUEE_DRAG_THRESHOLD`). */
const DRAG_THRESHOLD = 3

export type ResizeKind = 'container' | 'bigText'
export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

interface ScreenRect {
  x: number
  y: number
  w: number
  h: number
}

interface View {
  x: number
  y: number
  zoom: number
}

interface DragState {
  grabId: NodeId
  isContainer: boolean
  startX: number
  startY: number
  originX: number
  originY: number
  w: number
  h: number
  carryOrigins: Map<NodeId, { x: number; y: number }>
  lastX: number
  lastY: number
}

interface ResizeState {
  id: NodeId
  dir: ResizeDir
  kind: ResizeKind
  startX: number
  startY: number
  origin: Rect
}

interface MarqueeState {
  startScreenX: number
  startScreenY: number
  baseSelection: Set<string>
  moved: boolean
  clickContainerId: NodeId | null
  clickContainerIds: Set<NodeId>
  shiftKey: boolean
}

interface CreatingContainerState {
  startScreenX: number
  startScreenY: number
  moved: boolean
  clickNodeId: NodeId | null
}

/** The screen-space rect (plus whether it's moved past the click threshold) for a drag from `start` to the current pointer position. */
function dragScreenRect(
  start: { startScreenX: number; startScreenY: number },
  curX: number,
  curY: number,
): ScreenRect & { moved: boolean } {
  const x = Math.min(start.startScreenX, curX)
  const y = Math.min(start.startScreenY, curY)
  const w = Math.abs(curX - start.startScreenX)
  const h = Math.abs(curY - start.startScreenY)
  return { x, y, w, h, moved: w > DRAG_THRESHOLD || h > DRAG_THRESHOLD }
}

/** The resized rect for a border/corner drag of `dir` by screen delta `(dx, dy)` from `origin`, clamped to `(minW, minH)`. */
export function resizeRect(
  dir: ResizeDir,
  origin: Rect,
  dx: number,
  dy: number,
  minW: number,
  minH: number,
): Rect {
  let { x, y, w, h } = origin
  if (dir.includes('e')) w = origin.w + dx
  if (dir.includes('s')) h = origin.h + dy
  if (dir.includes('w')) {
    w = origin.w - dx
    if (w < minW) {
      x = origin.x + origin.w - minW
      w = minW
    } else {
      x = origin.x + dx
    }
  }
  if (dir.includes('n')) {
    h = origin.h - dy
    if (h < minH) {
      y = origin.y + origin.h - minH
      h = minH
    } else {
      y = origin.y + dy
    }
  }
  return { x, y, w: Math.max(minW, w), h: Math.max(minH, h) }
}

export function useBoardInteraction({
  nodes,
  view,
  boardElRef,
}: {
  nodes: readonly Node[]
  view: View
  boardElRef: RefObject<HTMLDivElement | null>
}) {
  const selection = useAtomValue(selectionAtom)
  const setSelection = useSetAtom(setSelectionAtom)
  const clearSelection = useSetAtom(clearSelectionAtom)
  const moveNodes = useSetAtom(moveNodesAtom)
  const updateNode = useSetAtom(updateNodeAtom)
  const addNode = useSetAtom(addNodeAtom)
  const setParentId = useSetAtom(setParentIdAtom)

  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  )

  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const marqueeRef = useRef<MarqueeState | null>(null)
  const creatingContainerRef = useRef<CreatingContainerState | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<ScreenRect | null>(null)
  const [creatingContainerRect, setCreatingContainerRect] =
    useState<ScreenRect | null>(null)

  // CRAP scoring penalizes this and the pointer-event handlers below for
  // 0% coverage — component/interaction tests aren't a required tier for
  // v0 (spec §13), and `.tsx`/hook interaction code is excluded from unit
  // coverage entirely (vitest.config.ts); real coverage comes from e2e
  // (e2e/*.spec.ts), which fallow's static analysis can't see.
  function toScreen(clientX: number, clientY: number) {
    return screenPoint(
      clientX,
      clientY,
      boardElRef.current?.getBoundingClientRect(),
    )
  }

  function toWorld(clientX: number, clientY: number) {
    return worldPoint(
      clientX,
      clientY,
      boardElRef.current?.getBoundingClientRect(),
      view,
    )
  }

  // Every container whose bounds contain a world point, innermost first —
  // geometric rather than DOM hit-testing, so which one "wins" doesn't
  // depend on paint order (see the prototype's `groupsContainingPoint`).
  // fallow-ignore-next-line complexity
  function containersContainingPoint(worldX: number, worldY: number) {
    return nodes
      .filter(
        // fallow-ignore-next-line complexity
        (node): node is ContainerNode =>
          node.type === 'container' &&
          worldX >= node.x &&
          worldX <= node.x + node.w &&
          worldY >= node.y &&
          worldY <= node.y + node.h,
      )
      .sort((a, b) => a.w * a.h - b.w * b.h)
  }

  // An edge is select-only (spec §4.3: "click a card/container/edge:
  // select it") — never draggable, so this doesn't need dragRef/carry
  // logic like handleNodePointerDown below.
  function handleEdgePointerDown(id: string, e: React.PointerEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    setSelection(computeSelectionAfterClick(selection, id, e.shiftKey))
  }

  // ---- Node drag: a card's whole body, or a container's drag handle ----

  // fallow-ignore-next-line complexity
  function handleNodePointerDown(id: NodeId, e: React.PointerEvent) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey) return
    e.stopPropagation()
    const node = nodesById.get(id)
    if (!node) return

    const nextSelection = computeSelectionAfterClick(selection, id, e.shiftKey)
    setSelection(nextSelection)

    const descendantIds =
      node.type === 'container'
        ? getDescendantIds(id, nodes)
        : new Set<NodeId>()
    const selectionCarryIds =
      nextSelection.size > 1 && nextSelection.has(id)
        ? [...nextSelection].filter(
            (otherId): otherId is NodeId =>
              otherId !== id &&
              !descendantIds.has(otherId) &&
              nodesById.has(otherId),
          )
        : []

    const origins = new Map<NodeId, { x: number; y: number }>()
    for (const carryId of [...descendantIds, ...selectionCarryIds]) {
      const carried = nodesById.get(carryId)
      if (carried) origins.set(carryId, { x: carried.x, y: carried.y })
    }

    dragRef.current = {
      grabId: id,
      isContainer: node.type === 'container',
      startX: e.clientX,
      startY: e.clientY,
      originX: node.x,
      originY: node.y,
      w: node.w,
      h: node.h,
      carryOrigins: origins,
      lastX: node.x,
      lastY: node.y,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  // A card's snapped position must never straddle any container's no-fly
  // zone (spec §4.4) — checked against every container, not just one.
  function clampCardOutOfEveryNoFlyZone(candidate: Rect): number {
    let y = candidate.y
    for (const container of nodes) {
      if (container.type !== 'container') continue
      const probe = { ...candidate, y }
      if (isInNoFlyZone(probe, container, CONTAINER_HANDLE_HEIGHT)) {
        y = clampOutOfNoFlyZone(probe, container, CONTAINER_HANDLE_HEIGHT).y
      }
    }
    return y
  }

  function dragTargetPosition(state: DragState, rawX: number, rawY: number) {
    const finalX = snapToGridMidpoint(rawX)
    if (state.isContainer) {
      // A container snaps to the grid on both axes — no Y-gutter/no-fly-
      // zone logic; only a *card* must avoid straddling another
      // container's handle band (spec §4.4).
      return { x: finalX, y: snapToGridMidpoint(rawY) }
    }

    const excludeIds = new Set([state.grabId, ...state.carryOrigins.keys()])
    const siblings: Rect[] = nodes
      .filter(
        (node): node is CardNode =>
          node.type === 'card' && !excludeIds.has(node.id),
      )
      .map((node) => ({ x: node.x, y: node.y, w: node.w, h: node.h }))
    const gutterY = snapY(
      { x: finalX, y: rawY, w: state.w, h: state.h },
      siblings,
    )
    const finalY = clampCardOutOfEveryNoFlyZone({
      x: finalX,
      y: gutterY,
      w: state.w,
      h: state.h,
    })
    return { x: finalX, y: finalY }
  }

  function handleNodePointerMove(e: React.PointerEvent) {
    const state = dragRef.current
    if (!state) return

    const dx = (e.clientX - state.startX) / view.zoom
    const dy = (e.clientY - state.startY) / view.zoom
    const { x: finalX, y: finalY } = dragTargetPosition(
      state,
      state.originX + dx,
      state.originY + dy,
    )

    state.lastX = finalX
    state.lastY = finalY

    const moves = [{ id: state.grabId, x: finalX, y: finalY }]
    const deltaX = finalX - state.originX
    const deltaY = finalY - state.originY
    for (const [id, origin] of state.carryOrigins) {
      moves.push({ id, x: origin.x + deltaX, y: origin.y + deltaY })
    }
    moveNodes(moves)
  }

  function handleNodePointerUp(e: React.PointerEvent) {
    const state = dragRef.current
    if (!state) return
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }

    // Drop-by-largest-overlap parent (re)assignment (spec §2.3) — only for
    // the node actually grabbed. A container's carried descendants keep
    // their existing parent (they moved along, not independently); other
    // multi-selection siblings get re-evaluated on their own drag.
    const rect: Rect = {
      x: state.lastX,
      y: state.lastY,
      w: state.w,
      h: state.h,
    }
    setParentId(state.grabId, computeParentIdOnDrop(state.grabId, rect, nodes))
  }

  // ---- Resize: container border/corner handles (always), big-text card handles ----

  function handleResizePointerDown(
    id: NodeId,
    dir: ResizeDir,
    kind: ResizeKind,
    e: React.PointerEvent,
  ) {
    e.stopPropagation()
    if (e.button !== 0) return
    const node = nodesById.get(id)
    if (!node) return
    resizeRef.current = {
      id,
      dir,
      kind,
      startX: e.clientX,
      startY: e.clientY,
      origin: { x: node.x, y: node.y, w: node.w, h: node.h },
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleResizePointerMove(e: React.PointerEvent) {
    const state = resizeRef.current
    if (!state) return
    const dx = (e.clientX - state.startX) / view.zoom
    const dy = (e.clientY - state.startY) / view.zoom
    const minW = state.kind === 'container' ? CONTAINER_MIN_W : BIG_TEXT_MIN_W
    const minH = state.kind === 'container' ? CONTAINER_MIN_H : BIG_TEXT_MIN_H

    const { x, y, w, h } = resizeRect(
      state.dir,
      state.origin,
      dx,
      dy,
      minW,
      minH,
    )
    updateNode(state.id, {
      x: snapToGridMidpoint(x),
      y: snapToGridMidpoint(y),
      w: snapSize(w, minW),
      h: snapSize(h, minH),
    })
  }

  function handleResizePointerUp(e: React.PointerEvent) {
    resizeRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  // ---- Canvas-level: marquee-select and Ctrl/Cmd+drag container creation ----
  //
  // Only reachable for a blank-canvas click or a click inside a
  // container's *body* (not its drag handle) — a card always calls
  // `stopPropagation` in handleNodePointerDown, and so does a container's
  // drag handle, so neither gesture bubbles up to here.

  // fallow-ignore-next-line complexity
  function handleCanvasPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    const { x: screenX, y: screenY } = toScreen(e.clientX, e.clientY)

    if (e.ctrlKey || e.metaKey) {
      const worldPt = toWorld(e.clientX, e.clientY)
      const target = e.target as HTMLElement
      const clickNodeId =
        target.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId ??
        containersContainingPoint(worldPt.x, worldPt.y)[0]?.id ??
        null
      creatingContainerRef.current = {
        startScreenX: screenX,
        startScreenY: screenY,
        moved: false,
        clickNodeId,
      }
      return
    }

    const worldPt = toWorld(e.clientX, e.clientY)
    const containing = containersContainingPoint(worldPt.x, worldPt.y)
    marqueeRef.current = {
      startScreenX: screenX,
      startScreenY: screenY,
      baseSelection: e.shiftKey ? new Set(selection) : new Set(),
      moved: false,
      clickContainerId: containing[0]?.id ?? null,
      clickContainerIds: new Set(containing.map((c) => c.id)),
      shiftKey: e.shiftKey,
    }
  }

  function updateCreatingContainer(e: React.PointerEvent) {
    const state = creatingContainerRef.current
    if (!state) return
    const { x: curX, y: curY } = toScreen(e.clientX, e.clientY)
    const rect = dragScreenRect(state, curX, curY)
    if (rect.moved) state.moved = true
    setCreatingContainerRect(rect)
  }

  // fallow-ignore-next-line complexity
  function updateMarquee(e: React.PointerEvent) {
    const state = marqueeRef.current
    if (!state) return
    const { x: curX, y: curY } = toScreen(e.clientX, e.clientY)
    const rect = dragScreenRect(state, curX, curY)
    if (rect.moved) state.moved = true
    setMarqueeRect(rect)

    const worldX1 = (rect.x - view.x) / view.zoom
    const worldY1 = (rect.y - view.y) / view.zoom
    const worldX2 = (rect.x + rect.w - view.x) / view.zoom
    const worldY2 = (rect.y + rect.h - view.y) / view.zoom

    const hits = new Set(state.baseSelection)
    for (const node of nodes) {
      // A marquee starting inside a container's body never selects that
      // container or any container enclosing it (spec §4.3) — every
      // container the drag started inside of, not just the innermost.
      if (node.type === 'container' && state.clickContainerIds.has(node.id))
        continue
      const overlaps =
        node.x < worldX2 &&
        node.x + node.w > worldX1 &&
        node.y < worldY2 &&
        node.y + node.h > worldY1
      if (overlaps) hits.add(node.id)
    }
    setSelection(hits)
  }

  function handleCanvasPointerMove(e: React.PointerEvent) {
    if (creatingContainerRef.current) {
      updateCreatingContainer(e)
      return
    }
    updateMarquee(e)
  }

  // fallow-ignore-next-line complexity
  function finishCreatingContainer() {
    const state = creatingContainerRef.current
    if (!state) return
    const finalRect = creatingContainerRect
    creatingContainerRef.current = null
    setCreatingContainerRect(null)
    if (state.moved && finalRect) {
      const worldRect = {
        x: (finalRect.x - view.x) / view.zoom,
        y: (finalRect.y - view.y) / view.zoom,
        w: finalRect.w / view.zoom,
        h: finalRect.h / view.zoom,
      }
      const container = createContainer(worldRect)
      addNode(container)
      setSelection(new Set([container.id]))
    } else if (state.clickNodeId) {
      // A Cmd/Ctrl+click (no drag) on a card/container toggles selection
      // instead — the "always wins" drag-to-create gesture only applies
      // once it becomes a real drag.
      setSelection(
        computeSelectionAfterClick(selection, state.clickNodeId, true),
      )
    }
  }

  function finishMarquee() {
    const state = marqueeRef.current
    if (!state) return
    marqueeRef.current = null
    setMarqueeRect(null)
    if (state.moved) return
    // A plain click (no drag) that started on a container's body selects
    // that container; on truly blank canvas, clears selection.
    // (Double-click-to-create-a-card is Stage 6's concern.)
    if (state.clickContainerId) {
      setSelection(
        computeSelectionAfterClick(
          selection,
          state.clickContainerId,
          state.shiftKey,
        ),
      )
    } else {
      clearSelection()
    }
  }

  function handleCanvasPointerUp() {
    if (creatingContainerRef.current) {
      finishCreatingContainer()
      return
    }
    finishMarquee()
  }

  return {
    selection,
    marqueeRect,
    creatingContainerRect,
    handleEdgePointerDown,
    handleNodePointerDown,
    handleNodePointerMove,
    handleNodePointerUp,
    handleResizePointerDown,
    handleResizePointerMove,
    handleResizePointerUp,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
  }
}
