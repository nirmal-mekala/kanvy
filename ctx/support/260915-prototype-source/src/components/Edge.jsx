// Purely presentational + click-to-select — an edge's shape is entirely
// derived from the two nodes it connects (see geometry.js), so it never
// needs its own drag state. Color isn't user-configurable (see EDGE_COLOR
// in board.js) — .edge__line's stroke and the marker fill both come from
// the single --edge-color CSS variable instead of per-edge state.
export default function Edge({ edge, d, selected, onSelect }) {
  // Selected always uses the neutral outline marker (a consistent "this is
  // selected" cue) instead of the fixed edge color — see Board.jsx's <defs>
  // for why each needs its own <marker> (a shared one can't be reached by a
  // CSS selector from the <g> that uses it).
  const markerId = selected ? 'edge-arrow-selected' : 'edge-arrow'
  const markerEnd = edge.direction === 'forward' ? `url(#${markerId})` : undefined
  const markerStart = edge.direction === 'backward' ? `url(#${markerId})` : undefined

  function handlePointerDown(e) {
    if (e.button !== 0) return
    onSelect?.(e.shiftKey)
  }

  return (
    <g className={`edge${selected ? ' edge--selected' : ''}`}>
      <path className="edge__hit" d={d} onPointerDown={handlePointerDown} />
      {/* A neutral-surface halo under the colored line so it still reads
          clearly over a busy group pattern, not just a plain background. */}
      <path className="edge__halo" d={d} />
      <path className="edge__line" d={d} markerEnd={markerEnd} markerStart={markerStart} />
    </g>
  )
}
