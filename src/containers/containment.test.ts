import { describe, expect, it } from 'vitest'
import type { CardNode, ContainerNode, Node } from '../schema/node'
import { computeCarryIds, containersContainingPoint } from './containment'

function containerNode(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function textCard(id: string, x: number, y: number, w = 40, h = 40): CardNode {
  return {
    id,
    type: 'card',
    kind: 'text',
    size: 'regular',
    x,
    y,
    w,
    h,
    color: 'gray',
    content: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('computeCarryIds', () => {
  it('carries every node completely within the dragged rect', () => {
    const nodes: Node[] = [
      textCard('a', 10, 10),
      textCard('b', 60, 10),
      textCard('far', 1000, 1000),
    ]
    const carried = computeCarryIds(
      { x: 0, y: 0, w: 120, h: 60 },
      'dragged',
      nodes,
    )
    expect(new Set(carried)).toEqual(new Set(['a', 'b']))
  })

  it('does not carry a node that only partially overlaps the dragged rect', () => {
    // "straddling" pokes 10px past the dragged rect's right edge (which
    // spans x: 0..100) — only touching it, not completely within it.
    const nodes: Node[] = [
      textCard('inside', 10, 10, 40, 40), // spans x: 10..50 — fully within
      textCard('straddling', 70, 10, 40, 40), // spans x: 70..110 — pokes out
    ]
    const carried = computeCarryIds(
      { x: 0, y: 0, w: 100, h: 60 },
      'dragged',
      nodes,
    )
    expect(carried).toEqual(['inside'])
  })

  it('returns an empty list when nothing is contained', () => {
    const nodes: Node[] = [textCard('far', 1000, 1000)]
    expect(
      computeCarryIds({ x: 0, y: 0, w: 50, h: 50 }, 'dragged', nodes),
    ).toEqual([])
  })

  it('excludes the dragged node itself even though its own rect trivially contains itself', () => {
    const nodes: Node[] = [containerNode('self', 0, 0, 100, 100)]
    expect(
      computeCarryIds({ x: 0, y: 0, w: 100, h: 100 }, 'self', nodes),
    ).toEqual([])
  })

  it('never carries a container that encloses the dragged rect — full containment rules ancestors out for free, no separate exclusion needed', () => {
    // Dragging "inner" must not pull its enclosing "outer" along — "outer"
    // is larger than "inner"'s rect, so it can never be *completely within*
    // it, unlike a plain overlap test (which is symmetric and would need
    // an explicit ancestor exclusion).
    const nodes: Node[] = [
      containerNode('outer', 0, 0, 400, 400),
      containerNode('inner', 100, 100, 50, 50),
    ]
    const carried = computeCarryIds(
      { x: 100, y: 100, w: 50, h: 50 },
      'inner',
      nodes,
    )
    expect(carried).toEqual([])
  })

  it('picks up a grandchild directly, in one flat pass, when dragging the outermost container', () => {
    // outer > middle > card, all geometrically nested (each completely
    // within its parent). Dragging "outer" must carry both "middle" and
    // "card" without needing to first walk middle's own members.
    const nodes: Node[] = [
      containerNode('outer', 0, 0, 400, 400),
      containerNode('middle', 50, 50, 200, 200),
      textCard('card', 100, 100, 30, 30),
    ]
    const carried = computeCarryIds(
      { x: 0, y: 0, w: 400, h: 400 },
      'outer',
      nodes,
    )
    expect(new Set(carried)).toEqual(new Set(['middle', 'card']))
  })

  it('carries a nested child but not its (excluded) ancestor when dragging the middle container', () => {
    const nodes: Node[] = [
      containerNode('outer', 0, 0, 400, 400),
      containerNode('middle', 50, 50, 200, 200),
      textCard('card', 100, 100, 30, 30),
    ]
    const carried = computeCarryIds(
      { x: 50, y: 50, w: 200, h: 200 },
      'middle',
      nodes,
    )
    expect(carried).toEqual(['card'])
  })

  it('a card lying elsewhere within the dragged rect is still swallowed directly', () => {
    const nodes: Node[] = [
      containerNode('parent', 10, 10, 50, 50),
      textCard('sibling', 200, 10, 30, 30),
    ]
    const carried = computeCarryIds(
      { x: 0, y: 0, w: 400, h: 100 },
      'dragged',
      nodes,
    )
    expect(new Set(carried)).toEqual(new Set(['parent', 'sibling']))
  })

  it('two unrelated contained containers are both carried', () => {
    const nodes: Node[] = [
      containerNode('left', 0, 0, 50, 50),
      containerNode('right', 200, 0, 50, 50),
    ]
    const carried = computeCarryIds(
      { x: 0, y: 0, w: 300, h: 100 },
      'dragged',
      nodes,
    )
    expect(new Set(carried)).toEqual(new Set(['left', 'right']))
  })
})

describe('containersContainingPoint', () => {
  it('returns the innermost (smallest-area) container when several nest', () => {
    const nodes: Node[] = [
      containerNode('outer', 0, 0, 400, 400),
      containerNode('inner', 100, 100, 100, 100),
    ]
    const hits = containersContainingPoint({ x: 150, y: 150 }, nodes)
    expect(hits.map((c) => c.id)).toEqual(['inner', 'outer'])
  })

  it('returns an empty list when the point is outside every container', () => {
    const nodes: Node[] = [containerNode('c1', 0, 0, 50, 50)]
    expect(containersContainingPoint({ x: 1000, y: 1000 }, nodes)).toEqual([])
  })

  it('a point exactly on the edge counts as inside (inclusive bounds)', () => {
    const nodes: Node[] = [containerNode('c1', 0, 0, 100, 100)]
    expect(
      containersContainingPoint({ x: 100, y: 100 }, nodes).map((c) => c.id),
    ).toEqual(['c1'])
  })

  it('ignores cards, only matching containers', () => {
    const nodes: Node[] = [
      containerNode('c1', 0, 0, 100, 100),
      textCard('card', 0, 0, 50, 50),
    ]
    expect(
      containersContainingPoint({ x: 10, y: 10 }, nodes).map((c) => c.id),
    ).toEqual(['c1'])
  })
})
