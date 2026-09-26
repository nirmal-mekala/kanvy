// The pannable/zoomable canvas viewport (spec §4.1) — dot-grid background,
// the transformed layer hosting containers/edges/cards. Selection, drag,
// resize, marquee, and connector-drawing interactivity are later stages
// (5-6); this stage renders the board and supports pan/zoom.

import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { sortContainersForRender } from '../../containers/renderOrder'
import { anchorPoint } from '../../geometry/anchor'
import { boundingBox } from '../../geometry/containment'
import { GRID_SIZE } from '../../geometry/snap'
import type { EdgeDirection } from '../../schema/edge'
import type { CardNode, ContainerNode } from '../../schema/node'
import { currentBoardIdAtom } from '../../state/atoms/currentBoard'
import { setEdgeDirectionAtom } from '../../state/atoms/edges'
import { focusNodeIdAtom } from '../../state/atoms/focus'
import { findImageDataUri, imagesAtom } from '../../state/atoms/images'
import {
  setColorAtom,
  setNodeHeightAtom,
  setPatternAtom,
  setTaskKindAtom,
  setTaskStatusAtom,
  setTextSizeAtom,
} from '../../state/atoms/nodes'
import { themeAtom } from '../../state/atoms/theme'
import { viewModeAtom } from '../../state/atoms/viewMode'
import { boardAtom } from '../../state/history/boardHistoryAtom'
import { getLiveEdges, getLiveNodes } from '../../state/liveEntities'
import { Card } from '../card/Card'
import { ConfirmModal } from '../confirm-modal/ConfirmModal'
import { Container } from '../container/Container'
import { EdgeDirectionControl } from '../edge/EdgeDirectionControl'
import { EdgeLayer } from '../edge/EdgeLayer'
import { HelpPanel } from '../help-panel/HelpPanel'
import { commonValue } from '../selection-menu/commonValue'
import { SelectionMenu } from '../selection-menu/SelectionMenu'
import { ModeToggle } from './ModeToggle'
import { useBoardInteraction } from './useBoardInteraction'
import { useCardCreation } from './useCardCreation'
import { useCardEditing } from './useCardEditing'
import { useClipboardShortcuts } from './useClipboardShortcuts'
import { useConnectionInteraction } from './useConnectionInteraction'
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
  const currentBoardId = useAtomValue(currentBoardIdAtom)
  // Multiboard support (ctx/notes/260917-multiboard-support-design.md §2):
  // `board.nodes`/`board.edges` are shared flat arrays across every board —
  // every render/query path below operates on these current-board-scoped
  // views, never the raw `board.nodes`/`board.edges`. Also the single real
  // fan-out point for tombstoning (schema v4) — filtering out trashed
  // entities here transitively keeps every downstream consumer (Card,
  // Container, EdgeLayer, renderOrder, containment/no-fly-zone/snap,
  // clipboard) live-only without each needing its own status check.
  const boardNodes = getLiveNodes(board, currentBoardId)
  const boardEdges = getLiveEdges(board, currentBoardId)
  const images = useAtomValue(imagesAtom)
  const theme = useAtomValue(themeAtom)
  const viewMode = useAtomValue(viewModeAtom)
  const setNodeHeight = useSetAtom(setNodeHeightAtom)
  const setEdgeDirection = useSetAtom(setEdgeDirectionAtom)
  const setColor = useSetAtom(setColorAtom)
  const setPattern = useSetAtom(setPatternAtom)
  const setTextSize = useSetAtom(setTextSizeAtom)
  const setTaskKind = useSetAtom(setTaskKindAtom)
  const setTaskStatus = useSetAtom(setTaskStatusAtom)
  const [focusNodeId, setFocusNodeId] = useAtom(focusNodeIdAtom)
  const [helpOpen, setHelpOpen] = useState(false)

  // Recency-mode border colors are a function of wall-clock time, not just
  // board data (spec §6.2) — this re-renders periodically while that mode
  // is active so a card visibly ages into the next threshold on its own,
  // without requiring a board edit. 60s is plenty given the coarsest
  // threshold (1 day) — the interval only runs while recency mode is on.
  const [, forceRecencyTick] = useState(0)
  useEffect(() => {
    if (viewMode !== 'recency') return
    const id = window.setInterval(
      () => forceRecencyTick((tick) => tick + 1),
      60_000,
    )
    return () => window.clearInterval(id)
  }, [viewMode])

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
    draggingIds,
    handleEdgePointerDown,
    handleNodePointerDown,
    handleNodePointerMove,
    handleNodePointerUp,
    handleNodePointerCancel,
    handleResizePointerDown,
    handleResizePointerMove,
    handleResizePointerUp,
    handleResizePointerCancel,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
  } = useBoardInteraction({ nodes: boardNodes, view, boardElRef })

  const nodesById = new Map(boardNodes.map((node) => [node.id, node]))

  const { handleContentChange, handleContentBlur } = useCardEditing({
    nodesById,
  })
  const { handleCanvasDoubleClick, handleCanvasDragOver, handleCanvasDrop } =
    useCardCreation({ nodesById, selection, view, boardElRef })
  const {
    connectingFromId,
    connectingFromSide,
    connectingHoverId,
    connectingHoverSide,
    previewStart,
    previewEndpoint,
    handleConnectorPointerDown,
    handleConnectingPointerMove,
    finishConnecting,
  } = useConnectionInteraction({
    nodes: boardNodes,
    edges: boardEdges,
    view,
    boardElRef,
  })

  const { pendingConfirm, confirmPending, cancelPending } =
    useClipboardShortcuts({
      nodes: boardNodes,
      nodesById,
      view,
      setView,
      boardElRef,
    })

  // Selected edges get the direction-toggle control (spec §4.6); selected
  // cards/containers get the full SelectionMenu (spec §4.3 — "one selection
  // menu for the whole selection, however mixed" — both can show at once).
  const selectedEdges = boardEdges.filter((edge) => selection.has(edge.id))
  const selectedCards = boardNodes.filter(
    (node): node is CardNode => node.type === 'card' && selection.has(node.id),
  )
  const selectedContainers = boardNodes.filter(
    (node): node is ContainerNode =>
      node.type === 'container' && selection.has(node.id),
  )
  const selectedNodeIds = [...selectedCards, ...selectedContainers].map(
    (node) => node.id,
  )

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
    if (boardNodes.length === 0) return
    const rect = boardElRef.current?.getBoundingClientRect()
    if (!rect) return

    const box = boundingBox(boardNodes)
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
  }, [boardNodes])

  // Entering a board (initial load or switching boards) snaps straight to
  // the zoom-to-fit position rather than keeping whatever pan/zoom the
  // previously-viewed board left behind (spec §4.1) — an empty board has
  // nothing to fit, so it gets the plain default view instead. Deliberately
  // keyed on `currentBoardId` alone — this should run once per board
  // switch, not every time `boardNodes`/`zoomToFitAll` change as a result
  // of editing the board's own content.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (boardNodes.length === 0) {
      setView({ x: 0, y: 0, zoom: 1 })
      return
    }
    zoomToFitAll()
  }, [currentBoardId])

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
    if (connectingFromId !== null) {
      handleConnectingPointerMove(e)
      return
    }
    handleCanvasPointerMove(e)
  }

  // fallow-ignore-next-line complexity
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
    if (connectingFromId !== null) {
      finishConnecting()
      return
    }
    handleCanvasPointerUp()
  }

  const edgePreview = (() => {
    if (connectingFromSide === null) return null
    const from = previewStart()
    const to = previewEndpoint()
    return from && to ? { from, fromSide: connectingFromSide, to } : null
  })()

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
      onDoubleClick={handleCanvasDoubleClick}
      onDragOver={handleCanvasDragOver}
      onDrop={handleCanvasDrop}
    >
      <div
        className="board__layer"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
        }}
      >
        {/* Containers render first so cards always paint on top of them
            (plain DOM order, per array-order-as-z-index — phase2 schema §1).
            Among containers themselves, render order is a depth-first walk
            of GEOMETRIC nesting (each subtree contiguous, in original array
            order) — v0.1, spec §2.3: there's no stored parentId, so "who's
            nested in whom" is derived fresh from x/y/w/h every render
            (containers/renderOrder.ts). A flat depth sort isn't enough
            either way — it would let a newly-created/duplicated container's
            own subtree interleave with unrelated existing containers at the
            same nesting depth, instead of that whole new subtree painting
            cleanly above everything before it. */}
        {sortContainersForRender(
          boardNodes.filter(
            (node): node is ContainerNode => node.type === 'container',
          ),
        ).map((node) => (
          <Container
            key={node.id}
            node={node}
            theme={theme}
            viewMode={viewMode}
            selected={selection.has(node.id)}
            dragging={draggingIds?.has(node.id) ?? false}
            connectorsVisible={
              connectingFromId === node.id || connectingHoverId === node.id
            }
            connectorActiveSide={
              connectingFromId === node.id
                ? connectingFromSide
                : connectingHoverId === node.id
                  ? connectingHoverSide
                  : null
            }
            onDragHandlePointerDown={handleNodePointerDown}
            onDragHandlePointerMove={handleNodePointerMove}
            onDragHandlePointerUp={handleNodePointerUp}
            onDragHandlePointerCancel={handleNodePointerCancel}
            onResizePointerDown={handleResizePointerDown}
            onResizePointerMove={handleResizePointerMove}
            onResizePointerUp={handleResizePointerUp}
            onResizePointerCancel={handleResizePointerCancel}
            onConnectorPointerDown={handleConnectorPointerDown}
            onConnectorPointerMove={handleConnectingPointerMove}
            onConnectorPointerUp={handlePointerUp}
          />
        ))}

        <EdgeLayer
          edges={boardEdges}
          nodesById={nodesById}
          selectedIds={selection}
          preview={edgePreview}
          onEdgePointerDown={handleEdgePointerDown}
        />

        {boardNodes
          .filter((node) => node.type === 'card')
          // fallow-ignore-next-line complexity
          .map((node) => {
            const imageSrc =
              node.kind === 'image'
                ? findImageDataUri(images, node.imageId)
                : undefined
            return (
              <Card
                key={node.id}
                node={node}
                {...(imageSrc ? { imageSrc } : {})}
                theme={theme}
                viewMode={viewMode}
                selected={selection.has(node.id)}
                dragging={draggingIds?.has(node.id) ?? false}
                connectorsVisible={
                  connectingFromId === node.id || connectingHoverId === node.id
                }
                connectorActiveSide={
                  connectingFromId === node.id
                    ? connectingFromSide
                    : connectingHoverId === node.id
                      ? connectingHoverSide
                      : null
                }
                autoFocus={focusNodeId === node.id}
                onAutoFocusHandled={() => setFocusNodeId(null)}
                onHeightChange={(h) => setNodeHeight(node.id, h)}
                onContentChange={handleContentChange}
                onContentBlur={handleContentBlur}
                onPointerDown={handleNodePointerDown}
                onPointerMove={handleNodePointerMove}
                onPointerUp={handleNodePointerUp}
                onPointerCancel={handleNodePointerCancel}
                onResizePointerDown={handleResizePointerDown}
                onResizePointerMove={handleResizePointerMove}
                onResizePointerUp={handleResizePointerUp}
                onResizePointerCancel={handleResizePointerCancel}
                onConnectorPointerDown={handleConnectorPointerDown}
                onConnectorPointerMove={handleConnectingPointerMove}
                onConnectorPointerUp={handlePointerUp}
              />
            )
          })}
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

      {selectedEdges.length > 0 &&
        (() => {
          const first = selectedEdges[0]
          if (!first) return null
          const fromNode = nodesById.get(first.fromNodeId)
          const toNode = nodesById.get(first.toNodeId)
          if (!fromNode || !toNode) return null
          const from = anchorPoint(fromNode, first.fromSide)
          const to = anchorPoint(toNode, first.toSide)
          const midX = (from.x + to.x) / 2
          const midY = (from.y + to.y) / 2
          const edgeIds = selectedEdges.map((edge) => edge.id)
          const commonDirection = commonValue(
            selectedEdges.map((edge) => edge.direction),
          )
          return (
            <EdgeDirectionControl
              x={midX * view.zoom + view.x}
              y={midY * view.zoom + view.y}
              direction={commonDirection}
              onChange={(direction: EdgeDirection) =>
                setEdgeDirection(edgeIds, direction)
              }
            />
          )
        })()}

      {selectedNodeIds.length > 0 &&
        (() => {
          const box = boundingBox([...selectedCards, ...selectedContainers])
          const worldX = box.x + box.w + GRID_SIZE
          const worldY = box.y
          return (
            <SelectionMenu
              x={worldX * view.zoom + view.x}
              y={worldY * view.zoom + view.y}
              theme={theme}
              selectedCards={selectedCards}
              selectedContainers={selectedContainers}
              onSetColor={(color) => setColor(selectedNodeIds, color)}
              onSetPattern={(pattern) => setPattern(selectedNodeIds, pattern)}
              onSetTextSize={(size) => setTextSize(selectedNodeIds, size)}
              onSetTaskKind={(kind) => setTaskKind(selectedNodeIds, kind)}
              onSetTaskStatus={(status) =>
                setTaskStatus(selectedNodeIds, status)
              }
            />
          )
        })()}

      {pendingConfirm && (
        <ConfirmModal
          title={pendingConfirm.title}
          confirmLabel={pendingConfirm.confirmLabel}
          onConfirm={confirmPending}
          onCancel={cancelPending}
        />
      )}

      <div className="board__bottom-bar">
        <HelpPanel open={helpOpen} onOpenChange={setHelpOpen} />
        <ModeToggle />
        <div className="board__zoom" onPointerDown={(e) => e.stopPropagation()}>
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
    </div>
  )
}
