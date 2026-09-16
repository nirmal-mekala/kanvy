import { describe, expect, it } from 'vitest'
import type { ContainerNode } from '../schema/node'
import { sortContainersForRender } from './renderOrder'

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

describe('sortContainersForRender', () => {
  it('renders an enclosing container before the one it geometrically encloses, even when the encloser comes first in array order', () => {
    // "grandparent" was appended to the end of `nodes` (as a freshly
    // ctrl/cmd+drag-created container always is), but geometrically
    // encloses "parent" — it must still render (and so paint) *before* it.
    const nodes: ContainerNode[] = [
      containerNode('parent', 50, 50, 100, 100),
      containerNode('grandparent', 0, 0, 400, 400),
    ]

    const ordered = sortContainersForRender(nodes)

    expect(ordered.map((c) => c.id)).toEqual(['grandparent', 'parent'])
  })

  it('holds transitively for a three-level geometric nesting, regardless of array order', () => {
    const nodes: ContainerNode[] = [
      containerNode('child', 80, 80, 50, 50),
      containerNode('grandparent', 0, 0, 400, 400),
      containerNode('parent', 50, 50, 150, 150),
    ]
    const ordered = sortContainersForRender(nodes)
    const rank = new Map(ordered.map((c, i) => [c.id, i]))
    expect(rank.get('grandparent')).toBeLessThan(rank.get('parent') as number)
    expect(rank.get('parent')).toBeLessThan(rank.get('child') as number)
  })

  it('leaves unrelated (non-nested) containers in their original relative order', () => {
    const nodes: ContainerNode[] = [
      containerNode('b', 0, 0, 50, 50),
      containerNode('a', 100, 0, 50, 50),
      containerNode('c', 200, 0, 50, 50),
    ]
    const ordered = sortContainersForRender(nodes)
    expect(ordered.map((c) => c.id)).toEqual(['b', 'a', 'c'])
  })

  it('keeps a whole newly-appended subtree contiguous and above the whole original subtree, instead of interleaving by depth (⌘/Ctrl+D duplicating a parent+child container pair)', () => {
    // Regression: a flat sort by depth number alone put every depth-0
    // container before every depth-1 container, regardless of lineage — so
    // a duplicated *parent* (depth 0) could end up rendered *below* the
    // *original* child (depth 1), even though the original child has
    // nothing to do with the duplicate. A depth-first walk keeps each
    // subtree grouped, so the whole duplicated subtree paints above the
    // whole original one.
    const nodes: ContainerNode[] = [
      containerNode('parent', 0, 0, 200, 200),
      containerNode('child', 20, 20, 50, 50),
      // Appended later, offset well clear of the original pair — an
      // entirely separate subtree, not nested in it at all.
      containerNode('dupParent', 500, 0, 200, 200),
      containerNode('dupChild', 520, 20, 50, 50),
    ]
    const ordered = sortContainersForRender(nodes)
    const rank = new Map(ordered.map((c, i) => [c.id, i]))

    // The whole original subtree comes before the whole duplicated one.
    expect(rank.get('child')).toBeLessThan(rank.get('dupParent') as number)
    expect(rank.get('parent')).toBeLessThan(rank.get('dupParent') as number)
  })

  it('attaches a duplicated child to its own duplicated parent, not the original, when both equal-area parents still geometrically enclose it (small ⌘/Ctrl+D offset)', () => {
    // Regression: ⌘/Ctrl+D only shifts x/y by a small fixed offset, so a
    // duplicated child can end up still geometrically inside the ORIGINAL
    // parent's rect too (same size, barely moved) — a naive "smallest-area
    // encloser, first found wins" tie-break attached it to the original
    // parent instead of its own duplicate, breaking it out of the new
    // subtree entirely.
    const offset = 32
    const nodes: ContainerNode[] = [
      containerNode('parent', 100, 100, 400, 400),
      containerNode('child', 130, 150, 200, 200),
      containerNode('dupParent', 100 + offset, 100 + offset, 400, 400),
      containerNode('dupChild', 130 + offset, 150 + offset, 200, 200),
    ]
    const ordered = sortContainersForRender(nodes)
    const rank = new Map(ordered.map((c, i) => [c.id, i]))

    expect(rank.get('child')).toBeLessThan(rank.get('dupParent') as number)
    expect(rank.get('parent')).toBeLessThan(rank.get('dupParent') as number)
    expect(rank.get('dupParent')).toBeLessThan(rank.get('dupChild') as number)
  })

  it('treats a container nested inside nothing else as a root', () => {
    const nodes: ContainerNode[] = [containerNode('orphan', 0, 0, 50, 50)]
    expect(sortContainersForRender(nodes).map((c) => c.id)).toEqual(['orphan'])
  })

  it('a newly-drawn container that encloses an existing one renders beneath it immediately, with no separate "children" step', () => {
    // Regression (original bug): a container ctrl/cmd-drag-created around
    // an existing one was appended to the end of the array and, under
    // plain array order, would paint *over* what it was just drawn around.
    const existing = containerNode('existing', 50, 50, 50, 50)
    const justDrawn = containerNode('justDrawn', 0, 0, 400, 400)
    const ordered = sortContainersForRender([existing, justDrawn])
    expect(ordered.map((c) => c.id)).toEqual(['justDrawn', 'existing'])
  })
})
