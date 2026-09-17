import { describe, expect, it } from 'vitest'
import type { Board } from '../../schema/board'
import { SCHEMA_VERSION } from '../../schema/board'
import { exportBoard, parseImportedBoard } from './import'

const board: Board = {
  version: SCHEMA_VERSION,
  nodes: [],
  edges: [],
  boards: [
    {
      id: 'root',
      title: 'Home',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  images: {},
}

describe('parseImportedBoard', () => {
  it('imports a well-formed export round-tripped through exportBoard', () => {
    const result = parseImportedBoard(exportBoard(board))
    expect(result).toEqual({ ok: true, board })
  })

  it('normalizes a legacy prototype export', () => {
    const legacy = JSON.stringify({
      cards: [{ id: 'c1', x: 0, y: 0, w: 224, color: 'gray', content: 'x' }],
      groups: [],
      edges: [],
      images: {},
    })
    const result = parseImportedBoard(legacy)
    expect(result.ok).toBe(true)
  })

  it('reports a parse error for invalid JSON', () => {
    expect(parseImportedBoard('{not json')).toEqual({
      ok: false,
      reason: 'parse-error',
    })
  })

  it('reports a validation error for JSON that is not a Kanvy export', () => {
    expect(parseImportedBoard(JSON.stringify({ hello: 'world' }))).toEqual({
      ok: false,
      reason: 'validation-error',
    })
  })
})
