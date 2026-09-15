// Renders every edge (spec §4.6) as a cubic-bezier SVG path between its two
// nodes' chosen anchor sides. Interactive edge-drawing (dragging from a
// connector affordance) is Stage 6's job — this stage only needs correct
// static rendering of edges already in the board.

import { anchorPoint } from '../../geometry/anchor'
import { bezierPath } from '../../geometry/curve'
import type { Edge as EdgeData } from '../../schema/edge'
import type { Node } from '../../schema/node'
import { Edge } from './Edge'

export function EdgeLayer({
  edges,
  nodesById,
  selectedIds,
}: {
  edges: readonly EdgeData[]
  nodesById: ReadonlyMap<string, Node>
  selectedIds?: ReadonlySet<string>
}) {
  return (
    <svg className="board__edges" data-testid="edge-layer" aria-hidden="true">
      <defs>
        <marker
          id="edge-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 Z" fill="var(--color-edge)" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const fromNode = nodesById.get(edge.fromNodeId)
        const toNode = nodesById.get(edge.toNodeId)
        if (!fromNode || !toNode) return null
        const from = anchorPoint(fromNode, edge.fromSide)
        const to = anchorPoint(toNode, edge.toSide)
        const d = bezierPath(from, edge.fromSide, to, edge.toSide, edge.id)
        return (
          <Edge
            key={edge.id}
            edge={edge}
            d={d}
            selected={selectedIds?.has(edge.id) ?? false}
          />
        )
      })}
    </svg>
  )
}
