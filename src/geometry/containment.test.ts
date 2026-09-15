import { describe, expect, it } from 'vitest'
import {
  boundingBox,
  findParentByLargestOverlap,
  type IdentifiedRect,
  overlapArea,
} from './containment'
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

describe('findParentByLargestOverlap', () => {
  const node: Rect = { x: 40, y: 40, w: 20, h: 20 } // 40..60, 40..60

  it('picks the container with the greatest overlap area', () => {
    const smallOverlap: IdentifiedRect = {
      id: 'small',
      x: 0,
      y: 0,
      w: 50,
      h: 50,
    } // overlaps 40..50 = 100
    const bigOverlap: IdentifiedRect = { id: 'big', x: 0, y: 0, w: 200, h: 200 } // overlaps fully = 400
    expect(findParentByLargestOverlap(node, [smallOverlap, bigOverlap])).toBe(
      'big',
    )
  })

  it('returns undefined when there is no overlap with any container', () => {
    const far: IdentifiedRect = { id: 'far', x: 1000, y: 1000, w: 10, h: 10 }
    expect(findParentByLargestOverlap(node, [far])).toBeUndefined()
  })

  it('returns undefined for an empty container list', () => {
    expect(findParentByLargestOverlap(node, [])).toBeUndefined()
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
