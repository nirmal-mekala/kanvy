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
})
