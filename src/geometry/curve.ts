// Phase 6 stub — signatures only, per ctx/notes/260915-kanvy-spec.md §4.6.
// Phase 7 Stage 6 fills in the real logic.

import type { Point, Side } from './anchor'

const SIDE_NORMALS: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

function hashSeed(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0
  }
  return h
}

/**
 * A stable, id-hashed pseudo-random perpendicular offset in
 * `[-magnitude, magnitude]` — deterministic per `id` so an edge's bow
 * doesn't jitter across renders, but varies across edges for organic
 * variety (spec §4.6).
 */
export function hashBow(id: string, magnitude: number): number {
  const normalized = (Math.abs(hashSeed(id)) % 1000) / 1000 // [0, 1)
  return (normalized * 2 - 1) * magnitude
}

function controlPoints(
  from: Point,
  fromSide: Side,
  to: Point,
  toSide: Side,
  id: string,
): { c1: Point; c2: Point } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy) || 1
  const px = -dy / dist
  const py = dx / dist

  // Floors ramp down to 0 as `dist` shrinks (instead of a fixed pixel
  // floor) so control points never overshoot past the opposite endpoint
  // for nodes spaced within a grid cell or two — a fixed floor here used
  // to push control points further out than `dist` itself, folding the
  // curve back on itself into a visible loop.
  const stub = Math.min(140, Math.max(Math.min(40, dist * 0.5), dist * 0.35))
  const bendMagnitude = Math.min(
    70,
    Math.max(Math.min(30, dist * 0.4), dist * 0.25),
  )
  const bend = hashBow(id, bendMagnitude)

  const n1 = SIDE_NORMALS[fromSide]
  const c1 = {
    x: from.x + n1.x * stub + px * bend,
    y: from.y + n1.y * stub + py * bend,
  }

  const n2 = SIDE_NORMALS[toSide]
  const c2 = {
    x: to.x + n2.x * stub + px * bend,
    y: to.y + n2.y * stub + py * bend,
  }

  return { c1, c2 }
}

/**
 * An SVG cubic-bezier path `d` attribute from `from` to `to`, leaving/
 * arriving perpendicular to `fromSide`/`toSide` before bending, with a
 * stable `hashBow(id, ...)` perpendicular bow (spec §4.6).
 */
export function bezierPath(
  from: Point,
  fromSide: Side,
  to: Point,
  toSide: Side,
  id: string,
): string {
  const { c1, c2 } = controlPoints(from, fromSide, to, toSide, id)
  return `M ${from.x},${from.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${to.x},${to.y}`
}

function cubicPointAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number) {
  const mt = 1 - t
  const a = mt * mt * mt
  const b = 3 * mt * mt * t
  const c = 3 * mt * t * t
  const d = t * t * t
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  }
}

// How far back along the curve (as a fraction of its length) to sample
// when aiming an arrowhead — the curve is built to arrive exactly
// perpendicular to its node's side (see `controlPoints` above), so the
// literal instantaneous tangent right at the endpoint is dominated by
// that fixed side-normal and barely reflects the curve's actual bow.
// Sampling a bit further back gives an angle that visually tracks the
// curve's approach instead of looking snapped square to the node.
const ARROW_LOOKBACK_T = 0.85

// Tip-to-base length (px) of the rendered arrowhead triangle (see
// `Edge.tsx`'s `ARROWHEAD_PATH`).
export const ARROWHEAD_LENGTH = 15

// How far past the arrowhead's base the line is allowed to keep going,
// back toward the tip — the line ends up mostly covered by the
// arrowhead's opaque fill, but poking a little into it (rather than
// stopping exactly at the base) reads as the line naturally flowing into
// the arrowhead instead of two shapes merely touching edge-to-edge.
const LINE_OVERLAP_INTO_ARROWHEAD = 7

export interface EdgeGeometry {
  /** The SVG path `d` attribute for the visible line, trimmed to leave
   * room for an arrowhead at `arrow`'s end, if any. */
  d: string
  /** The arrowhead's tip position (the true node anchor point) and its
   * rotation in degrees, or `null` for a direction-less edge. */
  arrow: { point: Point; angle: number } | null
}

/**
 * The full geometry — path plus optional arrowhead placement/rotation —
 * for one edge (spec §4.6). `arrowEnd` names which endpoint (if any)
 * carries an arrowhead, per the edge's `direction`.
 */
export function edgeGeometry(
  from: Point,
  fromSide: Side,
  to: Point,
  toSide: Side,
  id: string,
  arrowEnd: 'from' | 'to' | null,
): EdgeGeometry {
  const { c1, c2 } = controlPoints(from, fromSide, to, toSide, id)
  if (!arrowEnd) {
    return {
      d: `M ${from.x},${from.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${to.x},${to.y}`,
      arrow: null,
    }
  }

  const anchor = arrowEnd === 'to' ? to : from
  const t = arrowEnd === 'to' ? ARROW_LOOKBACK_T : 1 - ARROW_LOOKBACK_T
  const sample = cubicPointAt(from, c1, c2, to, t)
  const angle =
    (Math.atan2(anchor.y - sample.y, anchor.x - sample.x) * 180) / Math.PI
  const rad = (angle * Math.PI) / 180
  const trimDistance = ARROWHEAD_LENGTH - LINE_OVERLAP_INTO_ARROWHEAD
  const trimmed = {
    x: anchor.x - Math.cos(rad) * trimDistance,
    y: anchor.y - Math.sin(rad) * trimDistance,
  }

  const d =
    arrowEnd === 'to'
      ? `M ${from.x},${from.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${trimmed.x},${trimmed.y}`
      : `M ${trimmed.x},${trimmed.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${to.x},${to.y}`

  return { d, arrow: { point: anchor, angle } }
}
