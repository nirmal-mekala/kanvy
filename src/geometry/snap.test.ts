import { describe, expect, it } from 'vitest'
import {
  GRID_SIZE,
  type Rect,
  snapToGridMidpoint,
  snapY,
  Y_SNAP_GUTTER,
  Y_SNAP_THRESHOLD,
} from './snap'

describe('snapToGridMidpoint', () => {
  it('snaps to the nearest value congruent to gridSize/2 (mod gridSize)', () => {
    expect(snapToGridMidpoint(9)).toBe(8)
    expect(snapToGridMidpoint(30)).toBe(24)
  })

  it('leaves an exact midpoint unchanged', () => {
    expect(snapToGridMidpoint(8)).toBe(8)
    expect(snapToGridMidpoint(24)).toBe(24)
  })

  it('never returns a value that lands on a dot (multiple of gridSize)', () => {
    expect(snapToGridMidpoint(1) % GRID_SIZE).toBe(GRID_SIZE / 2)
    expect(snapToGridMidpoint(15) % GRID_SIZE).toBe(GRID_SIZE / 2)
  })
})

describe('snapY', () => {
  const neighbor: Rect = { x: 0, y: 100, w: 160, h: 40 } // bottom edge at 140

  it('snaps to the gutter below a column-overlapping neighbor within the threshold', () => {
    const candidate: Rect = {
      x: 20,
      y: 140 + Y_SNAP_THRESHOLD - 1,
      w: 160,
      h: 40,
    }
    expect(snapY(candidate, [neighbor])).toBe(140 + Y_SNAP_GUTTER)
  })

  it('snaps to the gutter above a column-overlapping neighbor within the threshold', () => {
    const candidate: Rect = {
      x: 20,
      y: 100 - Y_SNAP_THRESHOLD + 1 - 40,
      w: 160,
      h: 40,
    }
    expect(snapY(candidate, [neighbor])).toBe(100 - Y_SNAP_GUTTER - 40)
  })

  it('does not snap when outside the threshold', () => {
    const candidate: Rect = { x: 20, y: 500, w: 160, h: 40 }
    expect(snapY(candidate, [neighbor])).toBe(500)
  })

  it('does not snap when there is no X-column overlap', () => {
    const candidate: Rect = { x: 1000, y: 141, w: 160, h: 40 }
    expect(snapY(candidate, [neighbor])).toBe(141)
  })
})
