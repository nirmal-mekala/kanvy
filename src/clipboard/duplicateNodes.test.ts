import { describe, expect, it } from 'vitest'
import { newTextCard } from '../cards/newCard'
import type { Rect } from '../geometry/snap'
import type { Node } from '../schema/node'
import { duplicateNodes } from './duplicateNodes'

function containerNode(id: string, x = 0, y = 0, w = 200, h = 200): Node {
  return {
    id,
    boardId: 'root',
    type: 'container',
    pattern: 'none',
    color: 'gray',
    x,
    y,
    w,
    h,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('duplicateNodes', () => {
  it('returns an empty array for an empty input', () => {
    expect(duplicateNodes([], [])).toEqual([])
  })

  it('gives each duplicate a fresh id and offsets its position when nothing needs escaping', () => {
    const original = newTextCard(100, 100)
    const [dup] = duplicateNodes([original], [])
    expect(dup?.id).not.toBe(original.id)
    expect(dup?.x).toBeGreaterThan(original.x)
    expect(dup?.y).toBeGreaterThan(original.y)
  })

  it('applies the identical offset to every duplicated node, preserving relative spatial arrangement', () => {
    const container = containerNode('c1', 0, 0)
    const child = { ...newTextCard(20, 20), id: 'k1' }
    const [dupContainer, dupChild] = duplicateNodes([container, child], [])
    if (!dupContainer || !dupChild) throw new Error('missing node')

    expect(dupContainer.id).not.toBe('c1')
    expect(dupChild.id).not.toBe('k1')
    const offsetX = dupContainer.x - container.x
    const offsetY = dupContainer.y - container.y
    expect(dupChild.x - child.x).toBe(offsetX)
    expect(dupChild.y - child.y).toBe(offsetY)
  })

  it('preserves relative offsets across a three-level chain when the whole chain is duplicated', () => {
    const grandparent = containerNode('gp', 0, 0)
    const parent = containerNode('p', 20, 20)
    const child = { ...newTextCard(40, 40), id: 'k' }
    const [dupGp, dupParent, dupChild] = duplicateNodes(
      [grandparent, parent, child],
      [],
    )
    if (!dupGp || !dupParent || !dupChild) throw new Error('missing node')

    const offsetX = dupGp.x - grandparent.x
    const offsetY = dupGp.y - grandparent.y
    expect(dupParent.x - parent.x).toBe(offsetX)
    expect(dupParent.y - parent.y).toBe(offsetY)
    expect(dupChild.x - child.x).toBe(offsetX)
    expect(dupChild.y - child.y).toBe(offsetY)
  })

  it('pushes the duplicate clear of a container the baseline offset would still leave it stuck inside (mirrors paste, spec §2.3/§7)', () => {
    // A lone card duplicated with only a small baseline offset would still
    // land spatially inside this large container.
    const bigContainer: Rect = { x: 0, y: 0, w: 2000, h: 2000 }
    const card = { ...newTextCard(100, 100), id: 'a' }
    const [dup] = duplicateNodes([card], [bigContainer])
    if (!dup) throw new Error('missing node')

    const overlapsContainer =
      dup.x < bigContainer.x + bigContainer.w &&
      dup.x + dup.w > bigContainer.x &&
      dup.y < bigContainer.y + bigContainer.h &&
      dup.y + dup.h > bigContainer.y
    expect(overlapsContainer).toBe(false)
  })

  it('escapes even the container being duplicated itself, same as copy/paste', () => {
    const container = containerNode('c1', 100, 100, 300, 300)
    const [dup] = duplicateNodes(
      [container],
      [{ x: container.x, y: container.y, w: container.w, h: container.h }],
    )
    if (!dup) throw new Error('missing node')

    const overlapsOriginal =
      dup.x < container.x + container.w &&
      dup.x + dup.w > container.x &&
      dup.y < container.y + container.h &&
      dup.y + dup.h > container.y
    expect(overlapsOriginal).toBe(false)
  })
})
