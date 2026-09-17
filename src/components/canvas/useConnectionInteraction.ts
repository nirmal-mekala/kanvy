// Connector-affordance hover + drag-to-connect edge creation (spec §4.6).
// Ported from the prototype's Board.jsx connectingRef dance: dragging from
// a `.node-connector` div (rendered on every side of a hovered/selected
// node) to another node's body creates an edge, anchored to whichever side
// is nearest the drop point — a generous hit area, not a precise dot.

import { useSetAtom } from 'jotai'
import type { RefObject } from 'react'
import { useRef, useState } from 'react'
import type { Side } from '../../geometry/anchor'
import { anchorPoint, pickSide } from '../../geometry/anchor'
import type { Rect } from '../../geometry/snap'
import { ROOT_BOARD_ID } from '../../schema/boardMeta'
import type { Edge } from '../../schema/edge'
import { generateId } from '../../schema/legacy'
import type { Node, NodeId } from '../../schema/node'
import { addEdgeAtom, findEdgeBetween } from '../../state/atoms/edges'
import { setSelectionAtom } from '../../state/atoms/selection'
import type { View } from './viewportCoords'
import { worldPoint } from './viewportCoords'

interface ConnectingState {
  fromId: NodeId
  fromSide: Side
}

interface ConnectionPreview {
  x: number
  y: number
  hoverId: NodeId | null
  hoverSide: Side | null
}

/** The node whose body (not just its connector dots) is under `(clientX, clientY)`, per the prototype's forgiving "anywhere on the body" drop target. */
function nodeElementAtPoint(
  clientX: number,
  clientY: number,
): HTMLElement | null {
  return (
    document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>('[data-node-id]') ?? null
  )
}

// CRAP scoring penalizes this hook's functions for 0% coverage —
// component/interaction tests aren't a required tier for v0 (spec §13);
// real coverage comes from e2e (e2e/*.spec.ts), which fallow's static
// analysis can't see. Same precedent as useBoardInteraction.ts (Stage 5).
// fallow-ignore-next-line complexity
export function useConnectionInteraction({
  nodes,
  edges,
  view,
  boardElRef,
}: {
  nodes: readonly Node[]
  edges: readonly Edge[]
  view: View
  boardElRef: RefObject<HTMLDivElement | null>
}) {
  const addEdge = useSetAtom(addEdgeAtom)
  const setSelection = useSetAtom(setSelectionAtom)

  const connectingRef = useRef<ConnectingState | null>(null)
  const [preview, setPreview] = useState<ConnectionPreview | null>(null)

  function nodesById(): ReadonlyMap<NodeId, Node> {
    return new Map(nodes.map((node) => [node.id, node]))
  }

  function handleConnectorPointerDown(
    id: NodeId,
    side: Side,
    e: React.PointerEvent,
  ) {
    if (e.button !== 0) return
    e.stopPropagation()
    connectingRef.current = { fromId: id, fromSide: side }
    const world = worldPoint(
      e.clientX,
      e.clientY,
      boardElRef.current?.getBoundingClientRect(),
      view,
    )
    setPreview({ ...world, hoverId: null, hoverSide: null })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  // While hovering anywhere over a *different* node's body, snap the
  // preview to whichever side is nearest the cursor — same forgiving hit
  // area as the connector affordance itself (spec §4.6).
  // fallow-ignore-next-line complexity
  function handleConnectingPointerMove(e: React.PointerEvent) {
    const state = connectingRef.current
    if (!state) return
    const world = worldPoint(
      e.clientX,
      e.clientY,
      boardElRef.current?.getBoundingClientRect(),
      view,
    )
    const hoverEl = nodeElementAtPoint(e.clientX, e.clientY)
    const hoverId = hoverEl?.dataset.nodeId ?? null
    let hoverSide: Side | null = null
    if (hoverId && hoverId !== state.fromId) {
      const hoverNode = nodesById().get(hoverId)
      if (hoverNode) hoverSide = pickSide(world, hoverNode as Rect)
    }
    setPreview({
      ...world,
      hoverId: hoverId && hoverId !== state.fromId ? hoverId : null,
      hoverSide,
    })
  }

  // At most one edge per pair (spec §4.6) — dropping onto an
  // already-connected node selects the existing edge instead of
  // duplicating it.
  // fallow-ignore-next-line complexity
  function finishConnecting() {
    const state = connectingRef.current
    const current = preview
    connectingRef.current = null
    setPreview(null)
    if (!state || !current?.hoverId || !current.hoverSide) return

    const existing = findEdgeBetween(edges, state.fromId, current.hoverId)
    if (existing) {
      setSelection(new Set([existing.id]))
      return
    }

    const now = new Date().toISOString()
    // Both endpoints are already on the current board (an edge can't span
    // boards), so the new edge's boardId is just whichever board its
    // fromNode belongs to.
    const fromNode = nodesById().get(state.fromId)
    const edge: Edge = {
      id: generateId(),
      boardId: fromNode?.boardId ?? ROOT_BOARD_ID,
      fromNodeId: state.fromId,
      fromSide: state.fromSide,
      toNodeId: current.hoverId,
      toSide: current.hoverSide,
      direction: 'none',
      createdAt: now,
      updatedAt: now,
    }
    addEdge(edge)
    setSelection(new Set([edge.id]))
  }

  /** The world-space anchor point the in-progress connection line should currently draw to. */
  // fallow-ignore-next-line complexity
  function previewEndpoint(): { x: number; y: number } | null {
    if (!preview) return null
    if (preview.hoverId && preview.hoverSide) {
      const hoverNode = nodesById().get(preview.hoverId)
      if (hoverNode) return anchorPoint(hoverNode as Rect, preview.hoverSide)
    }
    return { x: preview.x, y: preview.y }
  }

  /** The fixed world-space anchor the in-progress connection line starts from. */
  function previewStart(): { x: number; y: number } | null {
    const state = connectingRef.current
    if (!state) return null
    const fromNode = nodesById().get(state.fromId)
    if (!fromNode) return null
    return anchorPoint(fromNode as Rect, state.fromSide)
  }

  return {
    isConnecting: connectingRef.current !== null || preview !== null,
    connectingFromId: connectingRef.current?.fromId ?? null,
    connectingFromSide: connectingRef.current?.fromSide ?? null,
    connectingHoverId: preview?.hoverId ?? null,
    connectingHoverSide: preview?.hoverSide ?? null,
    previewStart,
    previewEndpoint,
    handleConnectorPointerDown,
    handleConnectingPointerMove,
    finishConnecting,
  }
}
