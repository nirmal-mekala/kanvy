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
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy) || 1
  const px = -dy / dist
  const py = dx / dist

  const stub = Math.min(140, Math.max(40, dist * 0.35))
  const bend = hashBow(id, Math.min(70, Math.max(30, dist * 0.25)))

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

  return `M ${from.x},${from.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${to.x},${to.y}`
}
