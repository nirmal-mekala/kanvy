import { describe, expect, it } from 'vitest'
import {
  createIdRemapTable,
  recordRemap,
  resolveId,
  resolveValueReferences,
} from './networkIdRemap'

describe('resolveId', () => {
  it('returns the id unchanged when nothing was ever recorded', () => {
    const table = createIdRemapTable()
    expect(resolveId(table, 'node', 'n1')).toBe('n1')
  })

  it('returns the recorded remap for that id and kind', () => {
    const table = createIdRemapTable()
    recordRemap(table, 'node', 'client-n1', 'server-n1')
    expect(resolveId(table, 'node', 'client-n1')).toBe('server-n1')
  })

  it('keeps remaps scoped per entity kind — an id recorded for one kind does not leak into another', () => {
    const table = createIdRemapTable()
    recordRemap(table, 'node', 'shared-id', 'server-node')
    expect(resolveId(table, 'edge', 'shared-id')).toBe('shared-id')
  })

  it('is a no-op when the old and new id are the same', () => {
    const table = createIdRemapTable()
    recordRemap(table, 'image', 'img1', 'img1')
    expect(table.image.size).toBe(0)
  })
})

describe('resolveValueReferences', () => {
  it("rewrites a node's imageId when the image was already remapped", () => {
    const table = createIdRemapTable()
    recordRemap(table, 'image', 'client-img', 'server-img')
    const value = { kind: 'image', imageId: 'client-img' }
    expect(resolveValueReferences(table, value)).toEqual({
      kind: 'image',
      imageId: 'server-img',
    })
  })

  it("rewrites a node's boardRef when the board was already remapped", () => {
    const table = createIdRemapTable()
    recordRemap(table, 'board', 'client-board', 'server-board')
    const value = { kind: 'board', boardRef: 'client-board' }
    expect(resolveValueReferences(table, value)).toEqual({
      kind: 'board',
      boardRef: 'server-board',
    })
  })

  it("rewrites a node's boardId when the board was already remapped (the reported bug: a node created inside a not-yet-confirmed board)", () => {
    const table = createIdRemapTable()
    recordRemap(table, 'board', 'client-board', 'server-board')
    const value = { boardId: 'client-board', x: 1 }
    expect(resolveValueReferences(table, value)).toEqual({
      boardId: 'server-board',
      x: 1,
    })
  })

  it("rewrites an edge's boardId the same way", () => {
    const table = createIdRemapTable()
    recordRemap(table, 'board', 'client-board', 'server-board')
    const value = { boardId: 'client-board', fromNodeId: 'n1' }
    expect(resolveValueReferences(table, value)).toEqual({
      boardId: 'server-board',
      fromNodeId: 'n1',
    })
  })

  it("rewrites an edge's fromNodeId/toNodeId when both nodes were already remapped", () => {
    const table = createIdRemapTable()
    recordRemap(table, 'node', 'client-a', 'server-a')
    recordRemap(table, 'node', 'client-b', 'server-b')
    const value = { fromNodeId: 'client-a', toNodeId: 'client-b' }
    expect(resolveValueReferences(table, value)).toEqual({
      fromNodeId: 'server-a',
      toNodeId: 'server-b',
    })
  })

  it('returns the same object reference when nothing needed rewriting', () => {
    const table = createIdRemapTable()
    const value = { x: 1, y: 2 }
    expect(resolveValueReferences(table, value)).toBe(value)
  })

  it('leaves every other field untouched', () => {
    const table = createIdRemapTable()
    recordRemap(table, 'image', 'client-img', 'server-img')
    const value = { imageId: 'client-img', x: 10, color: 'gray' }
    expect(resolveValueReferences(table, value)).toEqual({
      imageId: 'server-img',
      x: 10,
      color: 'gray',
    })
  })
})
