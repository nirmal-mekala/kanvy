import { describe, expect, it } from 'vitest'
import { GRID_SIZE } from '../../geometry/snap'
import { gridScreenSpacing, MIN_GRID_SCREEN_SPACING } from './viewportConstants'

describe('gridScreenSpacing', () => {
  it('is GRID_SIZE * zoom when already wide enough', () => {
    expect(gridScreenSpacing(1)).toBe(GRID_SIZE)
    expect(gridScreenSpacing(2.5)).toBe(GRID_SIZE * 2.5)
    expect(gridScreenSpacing(0.5)).toBe(GRID_SIZE * 0.5)
  })

  it('doubles until at least MIN_GRID_SCREEN_SPACING at low zoom', () => {
    expect(gridScreenSpacing(0.25)).toBe(GRID_SIZE * 0.25 * 2)
    expect(gridScreenSpacing(0.1)).toBeCloseTo(GRID_SIZE * 0.1 * 8)
    for (const zoom of [0.1, 0.13, 0.2, 0.3, 0.45]) {
      expect(gridScreenSpacing(zoom)).toBeGreaterThanOrEqual(
        MIN_GRID_SCREEN_SPACING,
      )
    }
  })
})
