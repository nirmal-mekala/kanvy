// Purely presentational aside from click-to-select (spec §4.3, §4.6) — an
// edge's shape is entirely derived from the two nodes it connects.

import type { Edge as EdgeData } from '../../schema/edge'

// CRAP scoring penalizes this component's 0% coverage — component tests
// aren't a required tier for v0 (spec §13); real coverage comes from
// e2e/visual-regression specs, which fallow's static analysis can't see.
// fallow-ignore-next-line complexity
export function Edge({
  edge,
  d,
  selected = false,
  onPointerDown,
}: {
  edge: EdgeData
  d: string
  selected?: boolean
  onPointerDown?: (id: string, e: React.PointerEvent) => void
}) {
  const markerId = selected ? 'edge-arrow-selected' : 'edge-arrow'
  const markerEnd =
    edge.direction === 'forward' ? `url(#${markerId})` : undefined
  const markerStart =
    edge.direction === 'backward' ? `url(#${markerId})` : undefined

  return (
    <g
      className={`edge${selected ? ' edge--selected' : ''}`}
      data-edge-id={edge.id}
    >
      {/* Neutral-surface halo so the line stays legible over a patterned
          container background (spec §4.6). */}
      <path className="edge__halo" d={d} />
      <path
        className="edge__line"
        d={d}
        markerEnd={markerEnd}
        markerStart={markerStart}
      />
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
