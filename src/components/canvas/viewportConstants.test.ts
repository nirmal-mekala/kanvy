import { describe, expect, it } from 'vitest'
import { GRID_SIZE } from '../../geometry/snap'
import {
  gridScreenSpacing,
  keyboardZoomFactor,
  MIN_GRID_SCREEN_SPACING,
  ZOOM_BUTTON_STEP,
} from './viewportConstants'

describe('gridScreenSpacing', () => {
  it('is GRID_SIZE * zoom when already wide enough', () => {
    expect(gridScreenSpacing(1)).toBe(GRID_SIZE)
    expect(gridScreenSpacing(2.5)).toBe(GRID_SIZE * 2.5)
    expect(gridScreenSpacing(0.5)).toBe(GRID_SIZE * 0.5)
  })

  it('doubles until at least MIN_GRID_SCREEN_SPACING at low zoom', () => {
    expect(gridScreenSpacing(0.25)).toBe(GRID_SIZE * 0.25 * 2)
    expect(gridScreenSpacing(0.1)).toBeCloseTo(GRID_SIZE * 0.1 * 8)
    for (const zoom of [0.05, 0.07, 0.1, 0.13, 0.2, 0.3, 0.45]) {
      expect(gridScreenSpacing(zoom)).toBeGreaterThanOrEqual(
        MIN_GRID_SCREEN_SPACING,
      )
    }
  })
})

describe('keyboardZoomFactor', () => {
  const press = (
    code: string,
    mods: { metaKey?: boolean; ctrlKey?: boolean },
  ) => keyboardZoomFactor({ metaKey: false, ctrlKey: false, code, ...mods })

  it('zooms in on ⌘/Ctrl + = (and numpad +)', () => {
    expect(press('Equal', { metaKey: true })).toBe(ZOOM_BUTTON_STEP)
    expect(press('Equal', { ctrlKey: true })).toBe(ZOOM_BUTTON_STEP)
    expect(press('NumpadAdd', { ctrlKey: true })).toBe(ZOOM_BUTTON_STEP)
  })

  it('zooms out on ⌘/Ctrl + - (and numpad -)', () => {
    expect(press('Minus', { metaKey: true })).toBe(1 / ZOOM_BUTTON_STEP)
    expect(press('NumpadSubtract', { ctrlKey: true })).toBe(
      1 / ZOOM_BUTTON_STEP,
    )
  })

  it('ignores bare keys and unrelated combos', () => {
    expect(press('Equal', {})).toBeNull()
    expect(press('Minus', {})).toBeNull()
    expect(press('Digit0', { ctrlKey: true })).toBeNull()
    expect(press('KeyZ', { metaKey: true })).toBeNull()
  })
})
