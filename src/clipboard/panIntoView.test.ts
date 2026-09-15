import { describe, expect, it } from 'vitest'
import { panIntoView } from './panIntoView'

describe('panIntoView', () => {
  const viewportSize = { width: 800, height: 600 }

  it('leaves the view unchanged when the box is already fully visible', () => {
    const view = { x: 0, y: 0, zoom: 1 }
    const box = { x: 100, y: 100, w: 50, h: 50 }
    expect(panIntoView(box, view, viewportSize)).toEqual(view)
  })

  it('centers the view on the box when it is outside the viewport', () => {
    const view = { x: 0, y: 0, zoom: 1 }
    const box = { x: 5000, y: 5000, w: 50, h: 50 }
    const next = panIntoView(box, view, viewportSize)
    const boxCenterX = box.x + box.w / 2
    const boxCenterY = box.y + box.h / 2
    const screenCenterX = boxCenterX * next.zoom + next.x
    const screenCenterY = boxCenterY * next.zoom + next.y
    expect(screenCenterX).toBeCloseTo(viewportSize.width / 2)
    expect(screenCenterY).toBeCloseTo(viewportSize.height / 2)
  })

  it('does not change zoom', () => {
    const view = { x: 0, y: 0, zoom: 1.5 }
    const box = { x: 5000, y: 5000, w: 50, h: 50 }
    expect(panIntoView(box, view, viewportSize).zoom).toBe(1.5)
  })
})
