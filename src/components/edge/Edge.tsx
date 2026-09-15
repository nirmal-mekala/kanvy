// Purely presentational (spec §4.6) — an edge's shape is entirely derived
// from the two nodes it connects. Click-to-select (Stage 5/6) isn't wired
// yet, so `selected` only affects styling for now, not interaction.

import type { Edge as EdgeData } from '../../schema/edge'

export function Edge({
  edge,
  d,
  selected = false,
}: {
  edge: EdgeData
  d: string
  selected?: boolean
}) {
  const markerEnd =
    edge.direction === 'forward' ? 'url(#edge-arrow)' : undefined
  const markerStart =
    edge.direction === 'backward' ? 'url(#edge-arrow)' : undefined

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
    </g>
  )
}
