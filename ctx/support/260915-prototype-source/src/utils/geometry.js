export const SIDES = ['top', 'right', 'bottom', 'left']

export function anchorPoint(box, side) {
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  switch (side) {
    case 'top':
      return { x: cx, y: box.top }
    case 'bottom':
      return { x: cx, y: box.top + box.height }
    case 'left':
      return { x: box.left, y: cy }
    case 'right':
      return { x: box.left + box.width, y: cy }
    default:
      return { x: cx, y: cy }
  }
}

export function boxCenter(box) {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

// Keeps a note clear of the "no-fly zone" straddling a group's top edge —
// its drag handle plus a grid cell of breathing room below, and a matching
// grid cell of breathing room above — for any note whose [x, x+w] overlaps
// the group's column. A note can still be placed inside the group (below
// the zone) or entirely above the border (above the zone); it just can't
// end up touching the edge itself. Which side it's pushed toward is
// decided by the note's own vertical center relative to the group's top
// edge, so a note dragged from above stays above and one dragged/placed
// from within stays within. `zones` is an array of
// { left, right, top, zoneAbove, zoneBelow } (see Board.jsx).
export function clampYForGroupExclusions(x, w, h, y, zones) {
  let clamped = y
  for (const zone of zones) {
    const overlapsColumn = x < zone.right && x + w > zone.left
    if (!overlapsColumn) continue
    const center = clamped + h / 2
    if (center < zone.top) {
      const maxY = zone.zoneAbove - h
      if (clamped > maxY) clamped = maxY
    } else if (clamped < zone.zoneBelow) {
      clamped = zone.zoneBelow
    }
  }
  return clamped
}

// Whichever of a box's 4 sides is nearest `point` — used to pick a
// connection's side from wherever the cursor currently is over a node, so
// the user doesn't need to land on the tiny connector dot exactly.
export function bestSide(box, point) {
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const dx = point.x - cx
  const dy = point.y - cy
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

const SIDE_NORMALS = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

function hashSeed(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return h
}

// A cubic bezier that always leaves p1 heading straight out from `side1`
// (and, if given, arrives at p2 straight in from `side2`) before bending
// toward the other end. Unlike bowing perpendicular to the straight line
// between the two points, this reliably clears both nodes even when their
// chosen sides face away from each other (e.g. one node directly above the
// other, connected top-to-bottom) — the line visibly loops around rather
// than cutting through either node. `side2` may be omitted (e.g. an
// in-progress drag following the cursor), in which case the curve just
// approaches p2 directly.
//
// A perpendicular bow (relative to the straight p1→p2 line) is added on top
// of the two normal-aligned stubs, sized and signed from a hash of `seed`
// (an edge id, or any stable string) — organic variety with no user-facing
// control. This bow isn't just decorative: when side1/side2 point along the
// same axis as p1→p2 (e.g. exactly the top-of-A-to-bottom-of-B case above),
// the two stubs alone are colinear and produce a degenerate straight line —
// the perpendicular kick is what actually makes it visibly loop around.
export function curvedPath(seed, p1, side1, p2, side2) {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const dist = Math.hypot(dx, dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  const px = -uy // perpendicular unit vector to p1→p2
  const py = ux

  const jitter = 0.85 + (hashSeed(seed) % 100) / 333 // ~0.85–1.15
  const stub = Math.min(140, Math.max(40, dist * 0.35)) * jitter
  const sign = hashSeed(seed) % 2 === 0 ? 1 : -1
  const bend = sign * Math.min(70, Math.max(30, dist * 0.25)) * jitter

  const n1 = SIDE_NORMALS[side1] ?? { x: 0, y: 0 }
  const c1 = { x: p1.x + n1.x * stub + px * bend, y: p1.y + n1.y * stub + py * bend }

  let c2 = p2
  if (side2) {
    const n2 = SIDE_NORMALS[side2]
    c2 = { x: p2.x + n2.x * stub + px * bend, y: p2.y + n2.y * stub + py * bend }
  }

  return `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`
}
