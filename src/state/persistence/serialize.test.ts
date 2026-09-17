import { describe, expect, it } from 'vitest'
import type { Board } from '../../schema/board'
import { serializeBoard } from './serialize'

const board: Board = {
  version: 1,
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
  images: { img1: 'data:image/png;base64,abc' },
}

describe('serializeBoard', () => {
  it('places "images" after "edges" in the serialized output (spec §2.8)', () => {
    const json = serializeBoard(board)
    expect(json.indexOf('"images"')).toBeGreaterThan(json.indexOf('"edges"'))
  })

  it('round-trips through JSON.parse', () => {
    expect(JSON.parse(serializeBoard(board))).toEqual(board)
  })
})
