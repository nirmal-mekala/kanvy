import { describe, expect, it } from 'vitest'
import {
  clampOutOfNoFlyZone,
  isInNoFlyZone,
  NO_FLY_CLEARANCE,
} from './noFlyZone'
import type { Rect } from './snap'

const container: Rect = { x: 0, y: 200, w: 320, h: 200 }
const handleHeight = 24

describe('isInNoFlyZone', () => {
  it('is true for a candidate straddling the handle band', () => {
    const candidate: Rect = { x: 20, y: 200 + handleHeight / 2, w: 160, h: 40 }
    expect(isInNoFlyZone(candidate, container, handleHeight)).toBe(true)
  })

  it('is true for a candidate within the clearance above the handle', () => {
    const candidate: Rect = { x: 20, y: 200 - NO_FLY_CLEARANCE, w: 160, h: 2 }
    expect(isInNoFlyZone(candidate, container, handleHeight)).toBe(true)
  })

  it('is false for a candidate fully inside the container, below the zone', () => {
    const candidate: Rect = {
      x: 20,
      y: 200 + handleHeight + NO_FLY_CLEARANCE + 20,
      w: 160,
      h: 40,
    }
    expect(isInNoFlyZone(candidate, container, handleHeight)).toBe(false)
  })

  it('is false for a candidate fully above the container', () => {
    const candidate: Rect = { x: 20, y: 0, w: 160, h: 40 }
    expect(isInNoFlyZone(candidate, container, handleHeight)).toBe(false)
  })

  it('is false when there is no X overlap', () => {
    const candidate: Rect = {
      x: 2000,
      y: 200 + handleHeight / 2,
      w: 160,
      h: 40,
    }
    expect(isInNoFlyZone(candidate, container, handleHeight)).toBe(false)
  })
})

describe('clampOutOfNoFlyZone', () => {
  it('leaves a candidate outside the zone unchanged', () => {
    const candidate: Rect = { x: 20, y: 0, w: 160, h: 40 }
    expect(clampOutOfNoFlyZone(candidate, container, handleHeight)).toEqual(
      candidate,
    )
  })

  it('pushes a candidate in the zone out of it', () => {
    const candidate: Rect = { x: 20, y: 200 + handleHeight / 2, w: 160, h: 40 }
    const result = clampOutOfNoFlyZone(candidate, container, handleHeight)
    expect(isInNoFlyZone(result, container, handleHeight)).toBe(false)
  })
})
