// Purely presentational aside from click-to-select (spec §4.3, §4.6) — an
// edge's shape is entirely derived from the two nodes it connects.

import type { Point } from '../../geometry/anchor'
import { ARROWHEAD_LENGTH } from '../../geometry/curve'
import type { Edge as EdgeData } from '../../schema/edge'

// A triangle pointing along local +x, with its tip at the origin (the
// node's true anchor point) and its base trailing `ARROWHEAD_LENGTH` px
// behind — matching how far the line is trimmed back (see
// `edgeGeometry`), so the line always terminates exactly at the base's
// center. Rotated per-edge via `arrow.angle` so it visually tracks the
// curve's own approach into the endpoint rather than a fixed/shared
// orientation (spec §4.6).
const ARROWHEAD_PATH = `M -${ARROWHEAD_LENGTH},-7.5 L 0,0 L -${ARROWHEAD_LENGTH},7.5 Z`

// CRAP scoring penalizes this component's 0% coverage — component tests
// aren't a required tier for v0 (spec §13); real coverage comes from
// e2e/visual-regression specs, which fallow's static analysis can't see.
// fallow-ignore-next-line complexity
export function Edge({
  edge,
  d,
  arrow,
  selected = false,
  onPointerDown,
}: {
  edge: EdgeData
  d: string
  arrow: { point: Point; angle: number } | null
  selected?: boolean
  onPointerDown?: (id: string, e: React.PointerEvent) => void
}) {
  return (
    <g
      className={`edge${selected ? ' edge--selected' : ''}`}
      data-edge-id={edge.id}
    >
      <path className="edge__line" d={d} />
      {arrow && (
        <path
          className={`edge__arrowhead${
            selected ? ' edge__arrowhead--selected' : ''
          }`}
          d={ARROWHEAD_PATH}
          transform={`translate(${arrow.point.x},${arrow.point.y}) rotate(${arrow.angle})`}
        />
      )}
      {/* Invisible, much wider stroke — the generous click target for
          selecting an edge; the visible line above stays thin. */}
      <path
        className="edge__hit"
        d={d}
        onPointerDown={(e) => onPointerDown?.(edge.id, e)}
      />
    </g>
  )
}
