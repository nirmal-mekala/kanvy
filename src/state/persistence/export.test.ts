import { describe, expect, it } from 'vitest'
import type { Board } from '../../schema/board'
import { SCHEMA_VERSION } from '../../schema/board'
import { exportBoard } from './export'

const board: Board = {
  version: SCHEMA_VERSION,
  nodes: [],
  edges: [],
  boards: [
    {
      id: 'h0me0b0ard00',
      title: 'Home',
      status: 'active',
      isRoot: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  images: [],
}

describe('exportBoard', () => {
  it('serializes a board to JSON', () => {
    expect(JSON.parse(exportBoard(board))).toEqual(board)
  })
})
