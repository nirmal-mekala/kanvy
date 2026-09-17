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

  it('snaps to the gutter below a column-overlapping neighbor when that gutter is the closest option', () => {
    // Right at the gutter point itself, so it trivially beats the grid.
    const candidate: Rect = { x: 20, y: 140 + Y_SNAP_GUTTER, w: 160, h: 40 }
    expect(snapY(candidate, [neighbor])).toBe(140 + Y_SNAP_GUTTER)
  })

  it('snaps to the gutter above a column-overlapping neighbor when that gutter is the closest option', () => {
    const candidate: Rect = {
      x: 20,
      y: 100 - Y_SNAP_GUTTER - 40,
      w: 160,
      h: 40,
    }
    expect(snapY(candidate, [neighbor])).toBe(100 - Y_SNAP_GUTTER - 40)
  })

  it('still qualifies right at the edge of the threshold, and the gutter wins over the grid there', () => {
    // A qualifying neighbor's gutter always wins over the grid snap, even
    // when the raw position happens to be far from the gutter (but still
    // within Y_SNAP_THRESHOLD) — this is what makes the ~1-grid-height
    // band around a neighbor's edge act as a "no drop zone" that guides
    // drags into an equidistant gutter instead of letting the grid pull
    // the drop closer than that gap.
    const candidate: Rect = {
      x: 20,
      y: 140 + Y_SNAP_THRESHOLD - 1,
      w: 160,
      h: 40,
    }
    expect(snapY(candidate, [neighbor])).toBe(140 + Y_SNAP_GUTTER)
  })

  it('falls back to the grid (not the raw value) when no neighbor qualifies', () => {
    const candidate: Rect = { x: 20, y: 500, w: 160, h: 40 }
    expect(snapY(candidate, [neighbor])).toBe(snapToGridMidpoint(500))
  })

  it('falls back to the grid when there is no X-column overlap', () => {
    const candidate: Rect = { x: 1000, y: 141, w: 160, h: 40 }
    expect(snapY(candidate, [neighbor])).toBe(snapToGridMidpoint(141))
  })

  it('picks whichever qualifying neighbor is actually closest, not just the first one in the list', () => {
    // "near" is only 4px past its gutter-snap point; "far" (checked first,
    // array order) is 20px past its own — both within threshold, but
    // "near" is the closer, correct choice.
    const far: Rect = { x: 0, y: 100, w: 160, h: 40 } // bottom edge at 140
    const near: Rect = { x: 0, y: 400, w: 160, h: 40 } // bottom edge at 440
    const candidate: Rect = {
      x: 20,
      y: 440 + Y_SNAP_GUTTER + 4,
      w: 160,
      h: 40,
    }
    expect(snapY(candidate, [far, near])).toBe(440 + Y_SNAP_GUTTER)
  })

  it('prefers a qualifying neighbor gutter over the grid snap even when the grid is closer to the raw position', () => {
    const neighborFar: Rect = { x: 0, y: 100, w: 160, h: 40 } // bottom edge at 140, gutter at 156
    // Raw Y (152) sits exactly on a grid midpoint (0px away) and is also
    // within the neighbor's threshold; its gutter (156) is 4px away — farther
    // than the grid snap, but the neighbor still wins, since any qualifying
    // neighbor takes priority over the grid (the "no drop zone" guidance).
    const candidate: Rect = { x: 20, y: 152, w: 160, h: 40 }
    expect(snapY(candidate, [neighborFar])).toBe(156)
  })
})
