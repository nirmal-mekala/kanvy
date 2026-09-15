// Phase 6 stub — signatures only, per ctx/notes/260915-kanvy-spec.md §4.6.
// Phase 7 Stage 6 fills in the real logic.

import type { Point, Side } from './anchor'

/**
 * A stable, id-hashed pseudo-random perpendicular offset in
 * `[-magnitude, magnitude]` — deterministic per `id` so an edge's bow
 * doesn't jitter across renders, but varies across edges for organic
 * variety (spec §4.6).
 */
export function hashBow(_id: string, _magnitude: number): number {
  throw new Error('not implemented — phase 7')
}

/**
 * An SVG cubic-bezier path `d` attribute from `from` to `to`, leaving/
 * arriving perpendicular to `fromSide`/`toSide` before bending, with a
 * stable `hashBow(id, ...)` perpendicular bow (spec §4.6).
 */
export function bezierPath(
  _from: Point,
  _fromSide: Side,
  _to: Point,
  _toSide: Side,
  _id: string,
): string {
  throw new Error('not implemented — phase 7')
}
