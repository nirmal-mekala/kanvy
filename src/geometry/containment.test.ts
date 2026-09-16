import { describe, expect, it } from 'vitest'
import { boundingBox, fullyEncloses, overlapArea } from './containment'
import type { Rect } from './snap'

describe('overlapArea', () => {
  it('computes the intersection area of two overlapping rects', () => {
    const a: Rect = { x: 0, y: 0, w: 100, h: 100 }
    const b: Rect = { x: 50, y: 50, w: 100, h: 100 }
    expect(overlapArea(a, b)).toBe(50 * 50)
  })

  it('is 0 for non-overlapping rects', () => {
    const a: Rect = { x: 0, y: 0, w: 10, h: 10 }
    const b: Rect = { x: 100, y: 100, w: 10, h: 10 }
    expect(overlapArea(a, b)).toBe(0)
  })
})

describe('fullyEncloses', () => {
  const outer: Rect = { x: 0, y: 0, w: 100, h: 100 }

  it('is true when inner sits entirely within outer', () => {
    const inner: Rect = { x: 10, y: 10, w: 20, h: 20 }
    expect(fullyEncloses(outer, inner)).toBe(true)
  })

  it('is true when inner exactly matches outer (edges touch)', () => {
    expect(fullyEncloses(outer, { ...outer })).toBe(true)
  })

  it('is false when inner pokes outside outer on any edge', () => {
    expect(fullyEncloses(outer, { x: -1, y: 10, w: 20, h: 20 })).toBe(false)
    expect(fullyEncloses(outer, { x: 10, y: 10, w: 200, h: 20 })).toBe(false)
  })

  it('is false (not symmetric) when outer and inner are swapped', () => {
    const inner: Rect = { x: 10, y: 10, w: 20, h: 20 }
    expect(fullyEncloses(inner, outer)).toBe(false)
  })

  it('is false for two disjoint rects', () => {
    expect(fullyEncloses(outer, { x: 1000, y: 1000, w: 10, h: 10 })).toBe(false)
  })
})

describe('boundingBox', () => {
  it('encloses every rect', () => {
    const rects: Rect[] = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 50, y: -20, w: 10, h: 10 },
      { x: -5, y: 100, w: 5, h: 5 },
    ]
    expect(boundingBox(rects)).toEqual({ x: -5, y: -20, w: 65, h: 125 })
  })

  it('throws on an empty array', () => {
    expect(() => boundingBox([])).toThrow()
  })
})
