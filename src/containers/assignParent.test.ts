import { describe, expect, it } from 'vitest'
import type { ContainerNode, Node } from '../schema/node'
import { computeParentIdOnDrop } from './assignParent'

function containerNode(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  parentId?: string,
): ContainerNode {
  return {
    id,
    type: 'container',
    pattern: 'none',
    color: 'gray',
    x,
    y,
    w,
    h,
    ...(parentId ? { parentId } : {}),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('computeParentIdOnDrop', () => {
  it('assigns the container with the largest overlap', () => {
    const nodes: Node[] = [
      containerNode('small', 0, 0, 50, 50),
      containerNode('big', 0, 0, 200, 200),
    ]
    expect(
      computeParentIdOnDrop('dropped', { x: 40, y: 40, w: 20, h: 20 }, nodes),
    ).toBe('big')
  })

  it('returns undefined when nothing overlaps', () => {
    const nodes: Node[] = [containerNode('far', 1000, 1000, 10, 10)]
    expect(
      computeParentIdOnDrop('dropped', { x: 0, y: 0, w: 20, h: 20 }, nodes),
    ).toBeUndefined()
  })

  it('a node never becomes a child of its own descendant', () => {
    // "parent" formally contains "child" (nested container) — dragging
    // "parent" so it geometrically overlaps "child" must not make "parent"
    // a child of the container it itself owns.
    const nodes: Node[] = [
      containerNode('parent', 0, 0, 100, 100),
      containerNode('child', 0, 0, 50, 50, 'parent'),
    ]
    expect(
      computeParentIdOnDrop('parent', { x: 0, y: 0, w: 100, h: 100 }, nodes),
    ).toBeUndefined()
  })

  it('excludes the node itself from candidates', () => {
    const nodes: Node[] = [containerNode('self', 0, 0, 100, 100)]
    expect(
      computeParentIdOnDrop('self', { x: 0, y: 0, w: 100, h: 100 }, nodes),
    ).toBeUndefined()
  })
})
