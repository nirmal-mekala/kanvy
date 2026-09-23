import { describe, expect, it } from 'vitest'
import { BoardSchema, SCHEMA_VERSION } from './board'
import { ROOT_BOARD_ID } from './boardMeta'
import { normalizeLegacyBoard } from './legacy'
import { createSeedBoard } from './seed'

function validTextCard() {
  return {
    id: 'c1',
    boardId: ROOT_BOARD_ID,
    type: 'card',
    kind: 'text',
    size: 'regular',
    x: 0,
    y: 0,
    w: 224,
    h: 90,
    color: 'gray',
    status: 'active' as const,
    index: 0,
    content: 'hello',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function validContainer() {
  return {
    id: 'g1',
    boardId: ROOT_BOARD_ID,
    type: 'container',
    pattern: 'none',
    x: 0,
    y: 0,
    w: 128,
    h: 96,
    color: 'gray',
    status: 'active' as const,
    index: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function validBoardMeta() {
  return {
    id: ROOT_BOARD_ID,
    title: 'Home',
    status: 'active' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function validBoardCard() {
  return {
    id: 'b1',
    boardId: ROOT_BOARD_ID,
    type: 'card',
    kind: 'board',
    boardRef: 'child-1',
    x: 0,
    y: 0,
    w: 224,
    h: 90,
    color: 'gray',
    status: 'active' as const,
    index: 0,
    content: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('BoardSchema', () => {
  it('accepts a well-formed board with a mix of node kinds', () => {
    const board = {
      version: SCHEMA_VERSION,
      nodes: [validTextCard(), validContainer()],
      edges: [],
      boards: [validBoardMeta()],
      images: [],
    }
    const result = BoardSchema.safeParse(board)
    expect(result.success).toBe(true)
  })

  it('accepts a board card referencing a second boards entry', () => {
    const board = {
      version: SCHEMA_VERSION,
      nodes: [validBoardCard()],
      edges: [],
      boards: [
        validBoardMeta(),
        { ...validBoardMeta(), id: 'child-1', title: 'Untitled board' },
      ],
      images: [],
    }
    expect(BoardSchema.safeParse(board).success).toBe(true)
  })

  it('rejects a board card missing boardRef', () => {
    const invalid = { ...validBoardCard(), boardRef: undefined }
    const board = {
      version: SCHEMA_VERSION,
      nodes: [invalid],
      edges: [],
      boards: [validBoardMeta()],
      images: [],
    }
    expect(BoardSchema.safeParse(board).success).toBe(false)
  })

  it('rejects a node missing boardId', () => {
    const invalid = { ...validTextCard(), boardId: undefined }
    const board = {
      version: SCHEMA_VERSION,
      nodes: [invalid],
      edges: [],
      boards: [validBoardMeta()],
      images: [],
    }
    expect(BoardSchema.safeParse(board).success).toBe(false)
  })

  it('accepts the seed board', () => {
    expect(BoardSchema.safeParse(createSeedBoard().board).success).toBe(true)
  })

  it('rejects a heading-size image card (invalid kind/size combination)', () => {
    const invalid = {
      ...validTextCard(),
      kind: 'image',
      imageId: 'img1',
      size: 'h1',
    }
    const board = {
      version: SCHEMA_VERSION,
      nodes: [invalid],
      edges: [],
      images: [],
    }
    expect(BoardSchema.safeParse(board).success).toBe(false)
  })

  it('rejects a link card missing its link payload', () => {
    const invalid = { ...validTextCard(), kind: 'link' }
    const board = {
      version: SCHEMA_VERSION,
      nodes: [invalid],
      edges: [],
      images: [],
    }
    expect(BoardSchema.safeParse(board).success).toBe(false)
  })

  it('rejects a node with an unrecognized type', () => {
    const board = {
      version: SCHEMA_VERSION,
      nodes: [{ ...validTextCard(), type: 'widget' }],
      edges: [],
      images: [],
    }
    expect(BoardSchema.safeParse(board).success).toBe(false)
  })
})

const LEGACY_PROTOTYPE_DOCUMENT = {
  cards: [
    {
      id: 'c1',
      x: 80,
      y: 100,
      w: 224,
      color: 'amber',
      textSize: 'regular',
      content: 'hi',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'c2',
      x: 0,
      y: 0,
      w: 224,
      color: 'gray',
      content: '',
      imageId: 'img1',
    },
    {
      id: 'c3',
      x: 0,
      y: 0,
      w: 224,
      color: 'gray',
      content: '',
      linkUrl: 'https://example.com',
      linkStatus: 'ready',
      taskStatus: 'done',
    },
  ],
  groups: [
    {
      id: 'g1',
      x: 0,
      y: 0,
      w: 128,
      h: 96,
      color: 'gray',
      pattern: 'graphPaper',
    },
  ],
  edges: [
    {
      id: 'e1',
      fromId: 'c1',
      fromSide: 'right',
      toId: 'c2',
      toSide: 'left',
      direction: 'forward',
    },
  ],
  images: { img1: 'data:image/png;base64,abc' },
}

function normalizedLegacyFixture() {
  return BoardSchema.parse(normalizeLegacyBoard(LEGACY_PROTOTYPE_DOCUMENT))
}

describe('normalizeLegacyBoard', () => {
  it('converts a pre-v0 prototype document into a schema-valid board', () => {
    expect(() => normalizedLegacyFixture()).not.toThrow()
  })

  it('stamps boardId: root on every node/edge and synthesizes the root board (multiboard v3)', () => {
    const result = normalizedLegacyFixture()
    for (const node of result.nodes) {
      expect(node.boardId).toBe(ROOT_BOARD_ID)
    }
    for (const edge of result.edges) {
      expect(edge.boardId).toBe(ROOT_BOARD_ID)
    }
    expect(result.boards).toEqual([
      expect.objectContaining({ id: ROOT_BOARD_ID, status: 'active' }),
    ])
  })

  it('sorts containers before cards (array-order-as-z-index, phase 2 schema §1)', () => {
    expect(normalizedLegacyFixture().nodes[0]?.type).toBe('container')
  })

  it('maps a retired legacy pattern key (no longer in the v0 palette) to none', () => {
    const container = normalizedLegacyFixture().nodes[0]
    expect(container).toMatchObject({
      type: 'container',
      pattern: 'none',
    })
  })

  it('converts a flat linkUrl card into a nested link payload, preserving legacy taskStatus', () => {
    const linkCard = normalizedLegacyFixture().nodes.find(
      (n) => n.type === 'card' && n.kind === 'link',
    )
    expect(linkCard).toMatchObject({
      kind: 'link',
      link: { url: 'https://example.com' },
      task: { status: 'done' },
    })
  })

  it('renames fromId/toId to fromNodeId/toNodeId on edges', () => {
    const edge = normalizedLegacyFixture().edges[0]
    expect(edge).toMatchObject({ fromNodeId: 'c1', toNodeId: 'c2' })
  })

  it('backfills a missing version and per-entity timestamps on an already v0-shaped document', () => {
    const nearlyV0 = {
      nodes: [
        { ...validTextCard(), createdAt: undefined, updatedAt: undefined },
      ],
      edges: [],
      images: {},
    }
    const result = BoardSchema.parse(normalizeLegacyBoard(nearlyV0))
    expect(result.version).toBe(SCHEMA_VERSION)
    expect(result.nodes[0]?.createdAt).toBeTruthy()
  })

  it('upgrades a pre-v3 document (nodes/edges with no boardId, no boards array) to v3', () => {
    const preV3 = {
      version: 2,
      nodes: [{ ...validTextCard(), boardId: undefined }],
      edges: [],
      images: {},
    }
    const result = BoardSchema.parse(normalizeLegacyBoard(preV3))
    expect(result.version).toBe(SCHEMA_VERSION)
    expect(result.nodes[0]?.boardId).toBe(ROOT_BOARD_ID)
    expect(result.boards).toEqual([
      expect.objectContaining({ id: ROOT_BOARD_ID, status: 'active' }),
    ])
  })

  it("leaves an already-v3 document's boards/boardId untouched, only backfilling missing timestamps", () => {
    const v3 = {
      version: SCHEMA_VERSION,
      nodes: [validTextCard()],
      edges: [],
      boards: [{ id: ROOT_BOARD_ID, title: 'Home', status: 'active' }],
      images: {},
    }
    const result = BoardSchema.parse(normalizeLegacyBoard(v3))
    expect(result.boards).toHaveLength(1)
    expect(result.boards[0]?.createdAt).toBeTruthy()
  })

  it('passes non-object input through unchanged for the schema to reject', () => {
    expect(normalizeLegacyBoard(null)).toBe(null)
    expect(normalizeLegacyBoard('not an object')).toBe('not an object')
  })
})
