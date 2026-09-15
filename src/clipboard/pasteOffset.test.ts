import { describe, expect, it } from 'vitest'
import type { Rect } from '../geometry/snap'
import { computePasteOffset } from './pasteOffset'

describe('computePasteOffset', () => {
  const clipBox: Rect = { x: 0, y: 0, w: 100, h: 100 }

  it('is 0 for the first paste with no containers', () => {
    expect(computePasteOffset(0, clipBox, [])).toBe(0)
  })

  it('increases with each successive paste (staircase)', () => {
    const first = computePasteOffset(0, clipBox, [])
    const second = computePasteOffset(1, clipBox, [])
    const third = computePasteOffset(2, clipBox, [])
    expect(second).toBeGreaterThan(first)
    expect(third).toBeGreaterThan(second)
  })

  it('pushes further out when the staircase offset would land inside a container', () => {
    const container: Rect = { x: 0, y: 0, w: 400, h: 400 }
    const offset = computePasteOffset(0, clipBox, [container])
    const candidate: Rect = {
      x: clipBox.x + offset,
      y: clipBox.y + offset,
      w: clipBox.w,
      h: clipBox.h,
    }
    expect(
      candidate.x >= container.x + container.w ||
        candidate.y >= container.y + container.h ||
        candidate.x + candidate.w <= container.x ||
        candidate.y + candidate.h <= container.y,
    ).toBe(true)
  })

  it('leaves the staircase offset alone when no container is in the way', () => {
    const farContainer: Rect = { x: 10000, y: 10000, w: 10, h: 10 }
    expect(computePasteOffset(1, clipBox, [farContainer])).toBe(
      computePasteOffset(1, clipBox, []),
    )
  })
})
