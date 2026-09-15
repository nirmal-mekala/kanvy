import { describe, expect, it } from 'vitest'
import { anchorPoint, pickSide } from './anchor'
import type { Rect } from './snap'

const rect: Rect = { x: 100, y: 100, w: 100, h: 100 } // 100..200, 100..200, center (150,150)

describe('pickSide', () => {
  it('picks top for a point above the rect', () => {
    expect(pickSide({ x: 150, y: 0 }, rect)).toBe('top')
  })

  it('picks bottom for a point below the rect', () => {
    expect(pickSide({ x: 150, y: 300 }, rect)).toBe('bottom')
  })

  it('picks left for a point left of the rect', () => {
    expect(pickSide({ x: 0, y: 150 }, rect)).toBe('left')
  })

  it('picks right for a point right of the rect', () => {
    expect(pickSide({ x: 300, y: 150 }, rect)).toBe('right')
  })
})

describe('anchorPoint', () => {
  it('returns the midpoint of the requested side', () => {
    expect(anchorPoint(rect, 'top')).toEqual({ x: 150, y: 100 })
    expect(anchorPoint(rect, 'bottom')).toEqual({ x: 150, y: 200 })
    expect(anchorPoint(rect, 'left')).toEqual({ x: 100, y: 150 })
    expect(anchorPoint(rect, 'right')).toEqual({ x: 200, y: 150 })
  })
})
