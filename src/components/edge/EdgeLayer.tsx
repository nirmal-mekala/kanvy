// Renders every edge (spec §4.6) as a cubic-bezier SVG path between its two
// nodes' chosen anchor sides. Interactive edge-drawing (dragging from a
// connector affordance) is Stage 6's job — this stage only needs correct
// static rendering of edges already in the board.

import type { Point, Side } from '../../geometry/anchor'
import { anchorPoint } from '../../geometry/anchor'
import { bezierPath, edgeGeometry } from '../../geometry/curve'
import type { Edge as EdgeData } from '../../schema/edge'
import type { Node } from '../../schema/node'
import { Edge } from './Edge'

export function EdgeLayer({
  edges,
  nodesById,
  selectedIds,
  preview,
  onEdgePointerDown,
}: {
  edges: readonly EdgeData[]
  nodesById: ReadonlyMap<string, Node>
  selectedIds?: ReadonlySet<string>
  /** An in-progress connection being dragged out (spec §4.6) — not yet a real edge. */
  preview?: { from: Point; fromSide: Side; to: Point } | null
  onEdgePointerDown?: (id: string, e: React.PointerEvent) => void
}) {
  return (
    <svg className="board__edges" data-testid="edge-layer" aria-hidden="true">
      {/* CRAP scoring penalizes this callback's 0% coverage — component
          tests aren't a required tier for v0 (spec §13); real coverage
          comes from e2e/visual-regression specs, which fallow's static
          analysis can't see. */}
      {/* fallow-ignore-next-line complexity */}
      {edges.map((edge) => {
        const fromNode = nodesById.get(edge.fromNodeId)
        const toNode = nodesById.get(edge.toNodeId)
        if (!fromNode || !toNode) return null
        const from = anchorPoint(fromNode, edge.fromSide)
        const to = anchorPoint(toNode, edge.toSide)
        const arrowEnd =
          edge.direction === 'none'
            ? null
            : edge.direction === 'forward'
              ? 'to'
              : 'from'
        const { d, arrow } = edgeGeometry(
          from,
          edge.fromSide,
          to,
          edge.toSide,
          edge.id,
          arrowEnd,
        )
        return (
          <Edge
            key={edge.id}
            edge={edge}
            d={d}
            arrow={arrow}
            selected={selectedIds?.has(edge.id) ?? false}
            {...(onEdgePointerDown ? { onPointerDown: onEdgePointerDown } : {})}
          />
        )
      })}
      {preview && (
        <path
          className="edge__preview"
          d={bezierPath(
            preview.from,
            preview.fromSide,
            preview.to,
            preview.fromSide,
            '__preview__',
          )}
        />
      )}
    </svg>
  )
}
