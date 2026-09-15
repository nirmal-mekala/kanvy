import { describe, expect, it } from 'vitest'
import type { Node } from '../schema/node'
import { getDescendantIds } from './descendants'

function container(id: string, parentId?: string): Node {
  return {
    id,
    type: 'container',
    pattern: 'none',
    color: 'gray',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    ...(parentId ? { parentId } : {}),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('getDescendantIds', () => {
  it('finds direct children', () => {
    const nodes = [container('root'), container('child', 'root')]
    expect(getDescendantIds('root', nodes)).toEqual(new Set(['child']))
  })

  it('finds grandchildren, however deep', () => {
    const nodes = [
      container('root'),
      container('child', 'root'),
      container('grandchild', 'child'),
    ]
    expect(getDescendantIds('root', nodes)).toEqual(
      new Set(['child', 'grandchild']),
    )
  })

  it('is empty for a node with no children', () => {
    const nodes = [container('root'), container('other')]
    expect(getDescendantIds('root', nodes)).toEqual(new Set())
  })

  it('never includes an ancestor', () => {
    const nodes = [
      container('grandparent'),
      container('parent', 'grandparent'),
      container('child', 'parent'),
    ]
    expect(getDescendantIds('child', nodes)).toEqual(new Set())
  })
})
