import { describe, expect, it } from 'vitest'
import { BoardSchema, SCHEMA_VERSION } from './board'
import { normalizeLegacyBoard } from './legacy'
import { createSeedBoard } from './seed'

function validTextCard() {
  return {
    id: 'c1',
    type: 'card',
    kind: 'text',
    size: 'regular',
    x: 0,
    y: 0,
    w: 224,
    h: 90,
    color: 'gray',
    content: 'hello',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function validContainer() {
  return {
    id: 'g1',
    type: 'container',
    pattern: 'none',
    x: 0,
    y: 0,
    w: 128,
    h: 96,
    color: 'gray',
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
      images: {},
    }
    const result = BoardSchema.safeParse(board)
    expect(result.success).toBe(true)
  })

  it('accepts the seed board', () => {
    expect(BoardSchema.safeParse(createSeedBoard()).success).toBe(true)
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
      images: {},
    }
    expect(BoardSchema.safeParse(board).success).toBe(false)
  })

  it('rejects a link card missing its link payload', () => {
    const invalid = { ...validTextCard(), kind: 'link' }
    const board = {
      version: SCHEMA_VERSION,
      nodes: [invalid],
      edges: [],
      images: {},
    }
    expect(BoardSchema.safeParse(board).success).toBe(false)
  })

  it('rejects a node with an unrecognized type', () => {
    const board = {
      version: SCHEMA_VERSION,
      nodes: [{ ...validTextCard(), type: 'widget' }],
      edges: [],
      images: {},
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

  it('sorts containers before cards (array-order-as-z-index, phase 2 schema §1)', () => {
    expect(normalizedLegacyFixture().nodes[0]?.type).toBe('container')
  })

  it('maps a legacy camelCase pattern key to its kebab-case v0 equivalent', () => {
    const container = normalizedLegacyFixture().nodes[0]
    expect(container).toMatchObject({
      type: 'container',
      pattern: 'graph-paper',
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

  it('passes non-object input through unchanged for the schema to reject', () => {
    expect(normalizeLegacyBoard(null)).toBe(null)
    expect(normalizeLegacyBoard('not an object')).toBe('not an object')
  })
})
