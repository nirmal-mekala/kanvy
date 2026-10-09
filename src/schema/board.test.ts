import { describe, expect, it } from 'vitest'
import { type Board, BoardSchema, SCHEMA_VERSION } from './board'
import { rootBoardId } from './boardMeta'
import { normalizeLegacyBoard } from './legacy'
import { createSeedBoard } from './seed'

const ROOT_ID = 'h0me0b0ard00'

/** The shape `generateId()` mints — what a migrated root board's fresh id must look like. */
const GENERATED_ID = /^[0-9a-z]{12}$/

function validTextCard() {
  return {
    id: 'c1',
    boardId: ROOT_ID,
    nodeType: 'card',
    cardType: 'text',
    size: 'regular',
    x: 0,
    y: 0,
    w: 224,
    h: 90,
    color: 'gray',
    task: 'none' as const,
    status: 'active' as const,
    position: 0,
    content: 'hello',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function validContainer() {
  return {
    id: 'g1',
    boardId: ROOT_ID,
    nodeType: 'container',
    pattern: 'none',
    x: 0,
    y: 0,
    w: 128,
    h: 96,
    color: 'gray',
    task: 'none' as const,
    status: 'active' as const,
    position: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function validBoardMeta() {
  return {
    id: ROOT_ID,
    title: 'Home',
    status: 'active' as const,
    isRoot: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function validBoardCard() {
  return {
    id: 'b1',
    boardId: ROOT_ID,
    nodeType: 'card',
    cardType: 'board',
    boardRef: 'child-1',
    x: 0,
    y: 0,
    w: 224,
    h: 90,
    color: 'gray',
    task: 'none' as const,
    status: 'active' as const,
    position: 0,
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
        {
          ...validBoardMeta(),
          id: 'child-1',
          title: 'Untitled board',
          isRoot: false,
        },
      ],
      images: [],
    }
    expect(BoardSchema.safeParse(board).success).toBe(true)
  })

  it.each(['none', 'in_progress'])(
    "accepts a node whose task is '%s' (schema v7)",
    (task) => {
      const board = {
        version: SCHEMA_VERSION,
        nodes: [
          { ...validTextCard(), task },
          { ...validContainer(), task },
        ],
        edges: [],
        boards: [validBoardMeta()],
        images: [],
      }
      expect(BoardSchema.safeParse(board).success).toBe(true)
    },
  )

  it.each([
    ['the pre-v7 { status } object', { task: { status: 'done' } }],
    ['an unknown status', { task: 'someday' }],
    ['null', { task: null }],
    ['absent', { task: undefined }],
  ])('rejects a node whose task is %s', (_label, taskField) => {
    const { task: _task, ...container } = validContainer()
    const result = BoardSchema.safeParse({
      version: SCHEMA_VERSION,
      nodes: [
        taskField.task === undefined
          ? container
          : { ...container, ...taskField },
      ],
      edges: [],
      boards: [validBoardMeta()],
      images: [],
    })
    expect(result.success).toBe(false)
    // NodeSchema is a z.union, so Zod reports at the node (`nodes.0`); the
    // `task` path lives in the union's per-member `errors`.
    expect(JSON.stringify(result.error?.issues)).toContain('"path":["task"]')
  })

  describe('link cards (flat link fields, schema v7)', () => {
    function linkCard(fields: Record<string, unknown>) {
      const { size: _size, ...text } = validTextCard()
      return { ...text, cardType: 'link', ...fields }
    }
    function parse(node: unknown) {
      return BoardSchema.safeParse({
        version: SCHEMA_VERSION,
        nodes: [node],
        edges: [],
        boards: [validBoardMeta()],
        images: [],
      })
    }
    const flat = {
      linkUrl: 'https://example.com',
      linkTitle: null,
      linkImageUrl: null,
    }

    it.each([
      ['null title/image (not fetched yet, or the page has none)', flat],
      [
        'a fetched title and image',
        { ...flat, linkTitle: 'T', linkImageUrl: 'https://example.com/i.png' },
      ],
    ])('accepts %s', (_label, fields) => {
      expect(parse(linkCard(fields)).error?.issues).toBeUndefined()
    })

    it.each([
      [
        'the pre-v7 nested link object',
        { link: { url: 'https://example.com', status: 'ready' } },
      ],
      [
        'an absent (rather than null) linkTitle',
        { ...flat, linkTitle: undefined },
      ],
    ])('rejects %s', (_label, fields) => {
      const node = linkCard(fields)
      if ('linkTitle' in fields && fields.linkTitle === undefined) {
        delete (node as Record<string, unknown>).linkTitle
      }
      expect(parse(node).success).toBe(false)
    })

    it('strips a persisted linkStatus — fetch state is in-memory only', () => {
      const result = parse(linkCard({ ...flat, linkStatus: 'loading' }))
      expect(result.data?.nodes[0]).not.toHaveProperty('linkStatus')
    })
  })

  it('rejects a node that still carries the pre-v7 index instead of position', () => {
    const { position, ...container } = validContainer()
    const result = BoardSchema.safeParse({
      version: SCHEMA_VERSION,
      nodes: [{ ...container, index: position }],
      edges: [],
      boards: [validBoardMeta()],
      images: [],
    })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain(
      '"path":["position"]',
    )
  })

  it('rejects a boards entry missing isRoot, naming the field', () => {
    const { isRoot: _isRoot, ...noIsRoot } = validBoardMeta()
    const result = BoardSchema.safeParse({
      version: SCHEMA_VERSION,
      nodes: [],
      edges: [],
      boards: [noIsRoot],
      images: [],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain(
      'boards.0.isRoot',
    )
  })

  it('rejects a document with no root board', () => {
    const result = BoardSchema.safeParse({
      version: SCHEMA_VERSION,
      nodes: [],
      edges: [],
      boards: [{ ...validBoardMeta(), isRoot: false }],
      images: [],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/no board has isRoot/)
  })

  it('rejects a document with more than one root board, naming them', () => {
    const result = BoardSchema.safeParse({
      version: SCHEMA_VERSION,
      nodes: [],
      edges: [],
      boards: [validBoardMeta(), { ...validBoardMeta(), id: 'second-root' }],
      images: [],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(
      /2 boards have isRoot: true \("h0me0b0ard00", "second-root"\)/,
    )
  })

  it('rejects a trashed root board', () => {
    const result = BoardSchema.safeParse({
      version: SCHEMA_VERSION,
      nodes: [],
      edges: [],
      boards: [{ ...validBoardMeta(), status: 'trashed' }],
      images: [],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/must be active/)
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

  it("gives the seed board's root a generated id, not a reserved one", () => {
    const { board } = createSeedBoard()
    const rootId = rootBoardId(board.boards)
    expect(rootId).toMatch(GENERATED_ID)
    expect(rootId).not.toBe('root')
    expect(board.boards.filter((b) => b.isRoot)).toHaveLength(1)
  })

  it('rejects a heading-size image card (invalid kind/size combination)', () => {
    const invalid = {
      ...validTextCard(),
      cardType: 'image',
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
    const invalid = { ...validTextCard(), cardType: 'link' }
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
      nodes: [{ ...validTextCard(), nodeType: 'widget' }],
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

  it('synthesizes a root board with a generated id and stamps it on every node/edge (multiboard v3, isRoot v6)', () => {
    const result = normalizedLegacyFixture()
    const rootId = rootBoardId(result.boards)
    expect(rootId).toMatch(GENERATED_ID)
    for (const node of result.nodes) {
      expect(node.boardId).toBe(rootId)
    }
    for (const edge of result.edges) {
      expect(edge.boardId).toBe(rootId)
    }
    expect(result.boards).toEqual([
      expect.objectContaining({
        id: rootId,
        title: 'Home',
        status: 'active',
        isRoot: true,
      }),
    ])
  })

  it('sorts containers before cards (array-order-as-z-index, phase 2 schema §1)', () => {
    expect(normalizedLegacyFixture().nodes[0]?.nodeType).toBe('container')
  })

  it('maps a retired legacy pattern key (no longer in the v0 palette) to none', () => {
    const container = normalizedLegacyFixture().nodes[0]
    expect(container).toMatchObject({
      nodeType: 'container',
      pattern: 'none',
    })
  })

  it('keeps a prototype flat linkUrl card flat (schema v7), dropping linkStatus and preserving legacy taskStatus', () => {
    const linkCard = normalizedLegacyFixture().nodes.find(
      (n) => n.nodeType === 'card' && n.cardType === 'link',
    )
    expect(linkCard).toMatchObject({
      cardType: 'link',
      linkUrl: 'https://example.com',
      linkTitle: null,
      linkImageUrl: null,
      task: 'done',
    })
    expect(linkCard).not.toHaveProperty('linkStatus')
  })

  it('renames fromId/toId to fromNodeId/toNodeId on edges', () => {
    const edge = normalizedLegacyFixture().edges[0]
    expect(edge).toMatchObject({ fromNodeId: 'c1', toNodeId: 'c2' })
  })

  it('backfills a missing version and per-entity timestamps on an already v0-shaped document', () => {
    const nearlyV0 = {
      nodes: [
        {
          ...validTextCard(),
          boardId: 'root',
          createdAt: undefined,
          updatedAt: undefined,
        },
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
    const rootId = rootBoardId(result.boards)
    expect(result.version).toBe(SCHEMA_VERSION)
    expect(result.nodes[0]?.boardId).toBe(rootId)
    expect(result.boards).toEqual([
      expect.objectContaining({ id: rootId, status: 'active', isRoot: true }),
    ])
  })

  it("leaves a v6 document's boards/boardId/isRoot untouched, only backfilling missing timestamps", () => {
    const v6 = {
      version: SCHEMA_VERSION,
      nodes: [validTextCard()],
      edges: [],
      boards: [{ id: ROOT_ID, title: 'Home', status: 'active', isRoot: true }],
      images: {},
    }
    const result = BoardSchema.parse(normalizeLegacyBoard(v6))
    expect(result.boards).toEqual([
      expect.objectContaining({ id: ROOT_ID, isRoot: true }),
    ])
    expect(result.boards[0]?.createdAt).toBeTruthy()
    expect(result.nodes[0]?.boardId).toBe(ROOT_ID)
  })

  it('passes non-object input through unchanged for the schema to reject', () => {
    expect(normalizeLegacyBoard(null)).toBe(null)
    expect(normalizeLegacyBoard('not an object')).toBe('not an object')
  })
})

/** A v5 document as the app last persisted it: the home board is the reserved id `'root'`, and no `boards` entry has `isRoot`. */
function v5Document() {
  const ts = '2026-01-01T00:00:00.000Z'
  return {
    version: 5,
    nodes: [
      { ...validBoardCard(), id: 'bn1', boardId: 'root', boardRef: 'child-1' },
      { ...validTextCard(), id: 'on-root', boardId: 'root' },
      { ...validTextCard(), id: 'on-child', boardId: 'child-1' },
    ],
    edges: [
      {
        id: 'e1',
        boardId: 'root',
        fromNodeId: 'bn1',
        fromSide: 'right',
        toNodeId: 'on-root',
        toSide: 'left',
        direction: 'none',
        status: 'active',
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    boards: [
      {
        id: 'root',
        title: 'Home',
        status: 'active',
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: 'child-1',
        title: 'Child',
        status: 'active',
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    images: [],
  }
}

function migrate(document: unknown): Board {
  return BoardSchema.parse(normalizeLegacyBoard(document))
}

describe('normalizeLegacyBoard — v5 → v6 root-board migration (ctx/notes/261006-root-board-isroot.md)', () => {
  it("gives the reserved 'root' board a fresh generated id and isRoot: true", () => {
    const result = migrate(v5Document())
    const root = result.boards.find((b) => b.isRoot)
    expect(root?.id).toMatch(GENERATED_ID)
    expect(root?.id).not.toBe('root')
    expect(root).toMatchObject({ title: 'Home', status: 'active' })
    expect(result.boards.find((b) => b.id === 'root')).toBeUndefined()
    expect(result.version).toBe(SCHEMA_VERSION)
  })

  it('stamps isRoot: false on every other board, keeping its id', () => {
    const result = migrate(v5Document())
    expect(result.boards.find((b) => b.id === 'child-1')?.isRoot).toBe(false)
    expect(result.boards).toHaveLength(2)
  })

  it("repoints every node/edge boardId that was 'root', leaving other boards' content alone", () => {
    const result = migrate(v5Document())
    const rootId = rootBoardId(result.boards)
    const byId = new Map(result.nodes.map((n) => [n.id, n]))
    expect(byId.get('bn1')?.boardId).toBe(rootId)
    expect(byId.get('on-root')?.boardId).toBe(rootId)
    expect(byId.get('on-child')?.boardId).toBe('child-1')
    expect(result.edges[0]?.boardId).toBe(rootId)
  })

  it("leaves a board node's boardRef to an ordinary board alone, and repoints one that was 'root'", () => {
    const document = v5Document()
    document.nodes.push({
      ...validBoardCard(),
      id: 'bn-to-root',
      boardId: 'child-1',
      boardRef: 'root',
    })
    const result = migrate(document)
    const rootId = rootBoardId(result.boards)
    const refOf = (id: string) => {
      const node = result.nodes.find((n) => n.id === id)
      return node?.nodeType === 'card' && node.cardType === 'board'
        ? node.boardRef
        : undefined
    }
    expect(refOf('bn1')).toBe('child-1')
    expect(refOf('bn-to-root')).toBe(rootId)
  })

  it("synthesizes a root when a pre-v6 document's boards array has no 'root' entry", () => {
    const document = v5Document()
    document.boards = document.boards.filter((b) => b.id !== 'root')
    const result = migrate(document)
    const rootId = rootBoardId(result.boards)
    expect(rootId).toMatch(GENERATED_ID)
    expect(result.boards[0]).toMatchObject({ id: rootId, title: 'Home' })
    expect(result.nodes.find((n) => n.id === 'on-root')?.boardId).toBe(rootId)
  })

  it('mints a different root id on each migration (never a shared constant)', () => {
    const a = rootBoardId(migrate(v5Document()).boards)
    const b = rootBoardId(migrate(v5Document()).boards)
    expect(a).not.toBe(b)
  })
})

describe('normalizeLegacyBoard — v6 documents are never migrated or repaired', () => {
  function v6Document(boards: unknown[]) {
    return {
      version: SCHEMA_VERSION,
      nodes: [validTextCard()],
      edges: [],
      boards,
      images: [],
    }
  }

  it('rejects a v6 boards entry missing isRoot rather than inferring it', () => {
    const { isRoot: _isRoot, ...noIsRoot } = validBoardMeta()
    const result = BoardSchema.safeParse(
      normalizeLegacyBoard(v6Document([noIsRoot])),
    )
    expect(result.success).toBe(false)
  })

  it('does not synthesize a root for a v6 document that has none', () => {
    const result = BoardSchema.safeParse(
      normalizeLegacyBoard(
        v6Document([{ ...validBoardMeta(), isRoot: false }]),
      ),
    )
    expect(result.success).toBe(false)
  })

  it("treats a v6 board literally id'd 'root' as an ordinary id — not rewritten", () => {
    const result = migrate(
      v6Document([{ ...validBoardMeta(), id: 'root', isRoot: true }]),
    )
    expect(rootBoardId(result.boards)).toBe('root')
  })

  it('does not backfill a missing boardId on a v6 node', () => {
    const document = v6Document([validBoardMeta()])
    document.nodes = [{ ...validTextCard(), boardId: undefined as never }]
    expect(BoardSchema.safeParse(normalizeLegacyBoard(document)).success).toBe(
      false,
    )
  })
})
