// The pannable/zoomable canvas viewport (spec §4.1) — dot-grid background,
// the transformed layer hosting containers/edges/cards. Selection, drag,
// resize, marquee, and connector-drawing interactivity are later stages
// (5-6); this stage renders the board and supports pan/zoom.

import { useAtomValue, useSetAtom } from 'jotai'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { boundingBox } from '../../geometry/containment'
import { GRID_SIZE } from '../../geometry/snap'
import { imagesAtom } from '../../state/atoms/images'
import { updateNodeAtom } from '../../state/atoms/nodes'
import { themeAtom } from '../../state/atoms/theme'
import { boardAtom } from '../../state/history/boardHistoryAtom'
import { Card } from '../card/Card'
import { Container } from '../container/Container'
import { EdgeLayer } from '../edge/EdgeLayer'
import { useBoardInteraction } from './useBoardInteraction'
import {
  clamp,
  FIT_PADDING,
  MAX_ZOOM,
  MIN_ZOOM,
  WHEEL_ZOOM_INTENSITY,
  ZOOM_BUTTON_STEP,
} from './viewportConstants'

interface View {
  x: number
  y: number
  zoom: number
}

// CRAP scoring penalizes this component's 0% coverage — component tests
// aren't a required tier for v0 (spec §13); real coverage comes from e2e
// (e2e/*.spec.ts), which fallow's static analysis can't see.
// fallow-ignore-next-line complexity
export function Canvas() {
  const board = useAtomValue(boardAtom)
  const images = useAtomValue(imagesAtom)
  const theme = useAtomValue(themeAtom)
  const updateNode = useSetAtom(updateNodeAtom)
  // View modes (standard/task/recency, spec §6.2) are Stage 8's concern —
  // this stage always renders standard.
  const viewMode = 'standard' as const

  const boardElRef = useRef<HTMLDivElement | null>(null)
  const panRef = useRef<{
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 })
  const [panning, setPanning] = useState(false)

  const {
    selection,
    marqueeRect,
    creatingContainerRect,
    handleNodePointerDown,
    handleNodePointerMove,
    handleNodePointerUp,
    handleResizePointerDown,
    handleResizePointerMove,
    handleResizePointerUp,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
  } = useBoardInteraction({ nodes: board.nodes, view, boardElRef })

  const zoomAt = useCallback(
    (anchorX: number, anchorY: number, factor: number) => {
      setView((v) => {
        const newZoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM)
        if (newZoom === v.zoom) return v
        const worldX = (anchorX - v.x) / v.zoom
        const worldY = (anchorY - v.y) / v.zoom
        return {
          zoom: newZoom,
          x: anchorX - worldX * newZoom,
          y: anchorY - worldY * newZoom,
        }
      })
    },
    [],
  )

  const zoomByButton = useCallback(
    (factor: number) => {
      const rect = boardElRef.current?.getBoundingClientRect()
      if (!rect) return
      zoomAt(rect.width / 2, rect.height / 2, factor)
    },
    [zoomAt],
  )

  // Only reachable by clicking the zoom-percentage readout — no keyboard
  // shortcut for this one (spec §4.1's history note on the removed bare-key
  // zoom-reset shortcut).
  const resetZoom = useCallback(() => {
    const rect = boardElRef.current?.getBoundingClientRect()
    if (!rect) return
    const anchorX = rect.width / 2
    const anchorY = rect.height / 2
    setView((v) => {
      if (v.zoom === 1) return v
      const worldX = (anchorX - v.x) / v.zoom
      const worldY = (anchorY - v.y) / v.zoom
      return { zoom: 1, x: anchorX - worldX, y: anchorY - worldY }
    })
  }, [])

  // Zooms out (never in past 100%) and centers so every node's combined
  // bounding box is fully visible, with fixed world-space padding (spec
  // §4.1). Reads node geometry straight from board data (the stored
  // `x`/`y`/`w`/`h` are the source of truth per spec §2.4) rather than
  // DOM measurement.
  const zoomToFitAll = useCallback(() => {
    if (board.nodes.length === 0) return
    const rect = boardElRef.current?.getBoundingClientRect()
    if (!rect) return

    const box = boundingBox(board.nodes)
    const contentWidth = Math.max(1, box.w)
    const contentHeight = Math.max(1, box.h)
    const fitZoom = Math.min(
      (rect.width - FIT_PADDING * 2) / contentWidth,
      (rect.height - FIT_PADDING * 2) / contentHeight,
    )
    const newZoom = clamp(Math.min(fitZoom, 1), MIN_ZOOM, MAX_ZOOM)

    const worldCenterX = box.x + box.w / 2
    const worldCenterY = box.y + box.h / 2
    const anchorX = rect.width / 2
    const anchorY = rect.height / 2
    setView({
      zoom: newZoom,
      x: anchorX - worldCenterX * newZoom,
      y: anchorY - worldCenterY * newZoom,
    })
  }, [board.nodes])

  useEffect(() => {
    const el = boardElRef.current
    if (!el) return

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      if (e.metaKey || e.ctrlKey) {
        // Trackpad pinch gestures also report as wheel events with ctrlKey
        // set, so this covers both pinch-to-zoom and Ctrl/Cmd+scroll.
        const rect = el?.getBoundingClientRect()
        if (!rect) return
        zoomAt(
          e.clientX - rect.left,
          e.clientY - rect.top,
          Math.exp(-e.deltaY * WHEEL_ZOOM_INTENSITY),
        )
        return
      }
      setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  useEffect(() => {
    // CRAP scoring penalizes this handler's 0% coverage —
    // component/interaction tests aren't a required tier for v0 (spec
    // §13); real coverage comes from e2e (e2e/viewport.spec.ts), which
    // fallow's static analysis can't see.
    // fallow-ignore-next-line complexity
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key !== 'Enter') return
      e.preventDefault()
      zoomToFitAll()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [zoomToFitAll])

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button === 2) {
      e.preventDefault()
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: view.x,
        originY: view.y,
      }
      setPanning(true)
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    handleCanvasPointerDown(e)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (panRef.current) {
      const { startX, startY, originX, originY } = panRef.current
      setView((v) => ({
        ...v,
        x: originX + (e.clientX - startX),
        y: originY + (e.clientY - startY),
      }))
      return
    }
    handleCanvasPointerMove(e)
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (panRef.current) {
      panRef.current = null
      setPanning(false)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      return
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    handleCanvasPointerUp()
  }

  const nodesById = new Map(board.nodes.map((node) => [node.id, node]))

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the infinite canvas is pointer/wheel-driven by nature; full keyboard/screen-reader operability is explicitly out of v0 scope (spec §11).
    <div
      ref={boardElRef}
      data-testid="canvas-root"
      className={`board${panning ? ' board--panning' : ''}`}
      style={{
        backgroundPosition: `${view.x}px ${view.y}px`,
        backgroundSize: `${GRID_SIZE * view.zoom}px ${GRID_SIZE * view.zoom}px`,
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className="board__layer"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
        }}
      >
        {/* Containers render first so cards always paint on top of them
            (plain DOM order, per array-order-as-z-index — phase2 schema §1). */}
        {board.nodes
          .filter((node) => node.type === 'container')
          .map((node) => (
            <Container
              key={node.id}
              node={node}
              theme={theme}
              viewMode={viewMode}
              selected={selection.has(node.id)}
              onDragHandlePointerDown={handleNodePointerDown}
              onDragHandlePointerMove={handleNodePointerMove}
              onDragHandlePointerUp={handleNodePointerUp}
              onResizePointerDown={handleResizePointerDown}
              onResizePointerMove={handleResizePointerMove}
              onResizePointerUp={handleResizePointerUp}
            />
          ))}

        <EdgeLayer edges={board.edges} nodesById={nodesById} />

        {board.nodes
          .filter((node) => node.type === 'card')
          .map((node) => (
            <Card
              key={node.id}
              node={node}
              {...(node.kind === 'image' && images[node.imageId]
                ? { imageSrc: images[node.imageId] }
                : {})}
              theme={theme}
              viewMode={viewMode}
              selected={selection.has(node.id)}
              onHeightChange={(h) => {
                if (h !== node.h) updateNode(node.id, { h })
              }}
              onPointerDown={handleNodePointerDown}
              onPointerMove={handleNodePointerMove}
              onPointerUp={handleNodePointerUp}
              onResizePointerDown={handleResizePointerDown}
              onResizePointerMove={handleResizePointerMove}
              onResizePointerUp={handleResizePointerUp}
            />
          ))}
      </div>

      {/* Screen-space overlays — rendered outside `.board__layer` (which
          carries the pan/zoom transform) since these track the raw pointer
          position, not world coordinates. */}
      {marqueeRect && (
        <div
          className="board__marquee"
          style={{
            left: marqueeRect.x,
            top: marqueeRect.y,
            width: marqueeRect.w,
            height: marqueeRect.h,
          }}
        />
      )}

      {creatingContainerRect && (
        <div
          className="board__container-preview"
          style={{
            left: creatingContainerRect.x,
            top: creatingContainerRect.y,
            width: creatingContainerRect.w,
            height: creatingContainerRect.h,
          }}
        />
      )}

      {/* The `?` help-panel button (spec §4.2) is Stage 7's — it needs the
          shortcut list/modal, which doesn't exist yet. */}
      <div className="board__zoom">
        <button
          type="button"
          className="board__zoom-btn"
          onClick={() => zoomByButton(1 / ZOOM_BUTTON_STEP)}
          title="Zoom out"
        >
          <ZoomOut size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="board__zoom-btn board__zoom-btn--reset"
          onClick={resetZoom}
          title="Reset zoom"
        >
          {Math.round(view.zoom * 100)}%
        </button>
        <button
          type="button"
          className="board__zoom-btn"
          onClick={() => zoomByButton(ZOOM_BUTTON_STEP)}
          title="Zoom in"
        >
          <ZoomIn size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
