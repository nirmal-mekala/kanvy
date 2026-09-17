import { describe, expect, it } from 'vitest'
import { ARROWHEAD_LENGTH, bezierPath, edgeGeometry, hashBow } from './curve'

describe('hashBow', () => {
  it('is deterministic for the same id', () => {
    expect(hashBow('edge-1', 10)).toBe(hashBow('edge-1', 10))
  })

  it('is bounded within [-magnitude, magnitude]', () => {
    const magnitude = 10
    const value = hashBow('edge-1', magnitude)
    expect(value).toBeGreaterThanOrEqual(-magnitude)
    expect(value).toBeLessThanOrEqual(magnitude)
  })

  it('varies across different ids', () => {
    const values = ['edge-1', 'edge-2', 'edge-3', 'edge-4'].map((id) =>
      hashBow(id, 10),
    )
    expect(new Set(values).size).toBeGreaterThan(1)
  })
})

describe('bezierPath', () => {
  const from = { x: 0, y: 0 }
  const to = { x: 100, y: 100 }

  it('starts and ends at the given anchor points', () => {
    const path = bezierPath(from, 'right', to, 'left', 'edge-1')
    expect(path.startsWith(`M ${from.x},${from.y}`)).toBe(true)
    expect(path.endsWith(`${to.x},${to.y}`)).toBe(true)
  })

  it('is deterministic (same bow) for the same id', () => {
    const first = bezierPath(from, 'right', to, 'left', 'edge-1')
    const second = bezierPath(from, 'right', to, 'left', 'edge-1')
    expect(first).toBe(second)
  })

  it('differs across ids (varying bow) for the same endpoints', () => {
    const a = bezierPath(from, 'right', to, 'left', 'edge-1')
    const b = bezierPath(from, 'right', to, 'left', 'edge-2')
    expect(a).not.toBe(b)
  })

  function firstControlPoint(path: string) {
    const match = /^M ([\d.-]+),([\d.-]+) C ([\d.-]+),([\d.-]+)/.exec(path)
    if (!match) throw new Error(`unexpected path shape: ${path}`)
    return {
      x: Number(match[3]) - Number(match[1]),
      y: Number(match[4]) - Number(match[2]),
    }
  }

  it.each([
    ['right', 'x', 1],
    ['left', 'x', -1],
    ['bottom', 'y', 1],
    ['top', 'y', -1],
  ] as const)(
    "leaves the '%s' side heading outward (perpendicular to it, before any bend) — spec §4.6",
    (side, axis, sign) => {
      // The initial tangent direction at t=0 is proportional to
      // (firstControlPoint - from) — it must have a positive component
      // along the chosen side's own outward normal, i.e. the curve never
      // immediately doubles back into the node it's leaving.
      const dir = firstControlPoint(bezierPath(from, side, to, 'left', 'e'))
      expect(dir[axis] * sign).toBeGreaterThan(0)
    },
  )

  describe('nodes within 1-2 grid cells (GRID_SIZE = 16)', () => {
    function controlPoints(path: string) {
      const match =
        /^M ([\d.-]+),([\d.-]+) C ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/.exec(
          path,
        )
      if (!match) throw new Error(`unexpected path shape: ${path}`)
      const [, mx, my, c1x, c1y, c2x, c2y] = match
      return {
        from: { x: Number(mx), y: Number(my) },
        c1: { x: Number(c1x), y: Number(c1y) },
        c2: { x: Number(c2x), y: Number(c2y) },
      }
    }

    it.each([16, 24, 32])(
      "doesn't overshoot into a loop for a %dpx gap",
      (dist) => {
        const near = { x: 0, y: 0 }
        const far = { x: dist, y: 0 }
        const path = bezierPath(near, 'right', far, 'left', 'edge-1')
        const { c1, c2 } = controlPoints(path)

        // A control point pushed further from its own anchor than the
        // total distance between the two nodes overshoots past the
        // opposite endpoint, folding the curve back on itself into a
        // visible loop — the bug this floor-scaling fix prevents.
        const c1Offset = Math.hypot(c1.x - near.x, c1.y - near.y)
        const c2Offset = Math.hypot(c2.x - far.x, c2.y - far.y)
        expect(c1Offset).toBeLessThanOrEqual(dist)
        expect(c2Offset).toBeLessThanOrEqual(dist)
      },
    )
  })
})

describe('edgeGeometry', () => {
  const from = { x: 0, y: 0 }
  const to = { x: 200, y: 0 }

  it('returns no arrow and the full untrimmed path for a direction-less edge', () => {
    const { d, arrow } = edgeGeometry(from, 'right', to, 'left', 'edge-1', null)
    expect(arrow).toBeNull()
    expect(d).toBe(bezierPath(from, 'right', to, 'left', 'edge-1'))
  })

  it('is deterministic for the same id', () => {
    const a = edgeGeometry(from, 'right', to, 'left', 'edge-1', 'to')
    const b = edgeGeometry(from, 'right', to, 'left', 'edge-1', 'to')
    expect(a).toEqual(b)
  })

  it("varies across ids, tracking each curve's own bow rather than a fixed side-normal angle", () => {
    const angles = ['edge-1', 'edge-2', 'edge-3', 'edge-4'].map(
      (id) => edgeGeometry(from, 'right', to, 'left', id, 'to').arrow?.angle,
    )
    expect(new Set(angles).size).toBeGreaterThan(1)
  })

  it("still points broadly into the 'to' node for its side, not backwards along the curve", () => {
    // toSide 'left' means the curve arrives heading in the +x direction;
    // the arrow should keep pointing that way even once the curve's bow
    // is blended into its angle.
    for (const id of ['edge-1', 'edge-2', 'edge-3', 'edge-4']) {
      const { arrow } = edgeGeometry(from, 'right', to, 'left', id, 'to')
      expect(arrow).not.toBeNull()
      expect(Math.cos(((arrow?.angle ?? 0) * Math.PI) / 180)).toBeGreaterThan(0)
    }
  })

  it("computes the 'from' end angle independently of the 'to' end", () => {
    const toGeometry = edgeGeometry(from, 'right', to, 'left', 'edge-1', 'to')
    const fromGeometry = edgeGeometry(
      from,
      'right',
      to,
      'left',
      'edge-1',
      'from',
    )
    expect(fromGeometry.arrow?.angle).not.toBe(toGeometry.arrow?.angle)
  })

  it('places the arrow tip exactly at the true node anchor point', () => {
    const { arrow } = edgeGeometry(from, 'right', to, 'left', 'edge-1', 'to')
    expect(arrow?.point).toEqual(to)
  })

  function pathEndpoint(d: string) {
    const match = /([\d.-]+),([\d.-]+)$/.exec(d)
    if (!match) throw new Error(`unexpected path shape: ${d}`)
    return { x: Number(match[1]), y: Number(match[2]) }
  }

  function pathStart(d: string) {
    const match = /^M ([\d.-]+),([\d.-]+)/.exec(d)
    if (!match) throw new Error(`unexpected path shape: ${d}`)
    return { x: Number(match[1]), y: Number(match[2]) }
  }

  it("trims the line back from the 'to' anchor, ending inside the arrowhead along its own angle", () => {
    const { d, arrow } = edgeGeometry(from, 'right', to, 'left', 'edge-1', 'to')
    if (!arrow) throw new Error('expected an arrow')
    const end = pathEndpoint(d)
    // The line must stop short of the true anchor (leaving room for the
    // arrowhead) but a bit past its base, toward the tip/center, so the
    // seam reads as the line flowing into the arrowhead rather than two
    // shapes merely touching — never past the base, never all the way
    // to the tip.
    const offset = Math.hypot(to.x - end.x, to.y - end.y)
    expect(offset).toBeGreaterThan(0)
    expect(offset).toBeLessThan(ARROWHEAD_LENGTH)
    const rad = (arrow.angle * Math.PI) / 180
    expect(end.x).toBeCloseTo(to.x - Math.cos(rad) * offset, 5)
    expect(end.y).toBeCloseTo(to.y - Math.sin(rad) * offset, 5)
    // The path's start point is untouched for a 'to'-end arrow.
    expect(pathStart(d)).toEqual(from)
  })

  it("trims the line back from the 'from' anchor instead, for a start arrow", () => {
    const { d, arrow } = edgeGeometry(
      from,
      'right',
      to,
      'left',
      'edge-1',
      'from',
    )
    if (!arrow) throw new Error('expected an arrow')
    const start = pathStart(d)
    const offset = Math.hypot(from.x - start.x, from.y - start.y)
    expect(offset).toBeGreaterThan(0)
    expect(offset).toBeLessThan(ARROWHEAD_LENGTH)
    // The path's end point is untouched for a 'from'-end arrow.
    expect(pathEndpoint(d)).toEqual(to)
  })
})
