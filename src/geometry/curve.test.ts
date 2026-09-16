import { describe, expect, it } from 'vitest'
import { bezierPath, hashBow } from './curve'

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
})
