import { describe, expect, it } from 'vitest'
import { resizeRect } from './useBoardInteraction'

const origin = { x: 100, y: 100, w: 100, h: 100 }

describe('resizeRect', () => {
  it('grows from the east handle without moving the origin', () => {
    expect(resizeRect('e', origin, 20, 0, 10, 10)).toEqual({
      x: 100,
      y: 100,
      w: 120,
      h: 100,
    })
  })

  it('grows from the south handle without moving the origin', () => {
    expect(resizeRect('s', origin, 0, 20, 10, 10)).toEqual({
      x: 100,
      y: 100,
      w: 100,
      h: 120,
    })
  })

  it('shrinks from the west handle, moving x and shrinking w together', () => {
    expect(resizeRect('w', origin, 20, 0, 10, 10)).toEqual({
      x: 120,
      y: 100,
      w: 80,
      h: 100,
    })
  })

  it('clamps to the minimum instead of shrinking past it', () => {
    expect(resizeRect('w', origin, 95, 0, 10, 10)).toEqual({
      x: 190,
      y: 100,
      w: 10,
      h: 100,
    })
  })

  it('combines two edges for a corner handle', () => {
    expect(resizeRect('se', origin, 20, 30, 10, 10)).toEqual({
      x: 100,
      y: 100,
      w: 120,
      h: 130,
    })
  })
})
