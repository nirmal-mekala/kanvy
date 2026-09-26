import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from './board'
import { normalizeLegacyBoard } from './legacy'

describe('normalizeLegacyBoard — v0.1 parentId removal (spec §2.3)', () => {
  it('strips parentId from a v1 document (nodes array) and stamps the current SCHEMA_VERSION', () => {
    const v1Doc = {
      version: 1,
      nodes: [
        {
          id: 'container1',
          type: 'container',
          pattern: 'none',
          color: 'gray',
          x: 0,
          y: 0,
          w: 200,
          h: 200,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'card1',
          type: 'card',
          kind: 'text',
          size: 'regular',
          color: 'gray',
          content: '',
          x: 20,
          y: 20,
          w: 224,
          h: 90,
          parentId: 'container1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      edges: [],
      images: {},
    }

    const result = normalizeLegacyBoard(v1Doc) as {
      version: number
      nodes: Record<string, unknown>[]
    }

    expect(result.version).toBe(SCHEMA_VERSION)
    for (const node of result.nodes) {
      expect(node).not.toHaveProperty('parentId')
    }
    // The still-present x/y/w/h is untouched — spatial containment
    // re-derives from it going forward.
    expect(result.nodes[1]).toMatchObject({ x: 20, y: 20 })
  })

  it('always stamps the current SCHEMA_VERSION on a v0-shaped document, even one that already claims a stale version number', () => {
    const staleDoc = {
      version: 1,
      nodes: [],
      edges: [],
      images: {},
    }
    const result = normalizeLegacyBoard(staleDoc) as { version: number }
    expect(result.version).toBe(SCHEMA_VERSION)
  })

  it('strips a stray parentId from a pre-v0 (prototype-shaped) document too', () => {
    const preV0Doc = {
      cards: [
        {
          id: 'c1',
          x: 0,
          y: 0,
          w: 224,
          color: 'gray',
          content: 'hi',
          // A stray field a hand-edited or malformed export might carry —
          // the prototype itself never wrote this.
          parentId: 'g1',
        },
      ],
      groups: [{ id: 'g1', x: 0, y: 0, w: 200, h: 200, color: 'gray' }],
      edges: [],
      images: {},
    }

    const result = normalizeLegacyBoard(preV0Doc) as {
      nodes: Record<string, unknown>[]
    }

    for (const node of result.nodes) {
      expect(node).not.toHaveProperty('parentId')
    }
  })
})

describe('normalizeLegacyBoard — big → h1 text-size rename', () => {
  it('migrates a v0-shaped document\'s size: "big" text card to "h1"', () => {
    const v1Doc = {
      version: 1,
      nodes: [
        {
          id: 'card1',
          type: 'card',
          kind: 'text',
          size: 'big',
          color: 'gray',
          content: '',
          x: 0,
          y: 0,
          w: 320,
          h: 240,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      edges: [],
      images: {},
    }

    const result = normalizeLegacyBoard(v1Doc) as {
      nodes: Record<string, unknown>[]
    }

    expect(result.nodes[0]).toMatchObject({ size: 'h1' })
  })

  it('migrates a pre-v0 (prototype-shaped) document\'s legacy textSize: "big" card to "h1"', () => {
    const preV0Doc = {
      cards: [
        {
          id: 'c1',
          x: 0,
          y: 0,
          w: 320,
          color: 'gray',
          content: 'hi',
          textSize: 'big',
        },
      ],
      groups: [],
      edges: [],
      images: {},
    }

    const result = normalizeLegacyBoard(preV0Doc) as {
      nodes: Record<string, unknown>[]
    }

    expect(result.nodes[0]).toMatchObject({ size: 'h1' })
  })

  it('leaves an already-current h2/h3 size untouched', () => {
    for (const size of ['h2', 'h3']) {
      const v1Doc = {
        version: 1,
        nodes: [
          {
            id: 'card1',
            type: 'card',
            kind: 'text',
            size,
            color: 'gray',
            content: '',
            x: 0,
            y: 0,
            w: 320,
            h: 240,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        edges: [],
        images: {},
      }
      const result = normalizeLegacyBoard(v1Doc) as {
        nodes: Record<string, unknown>[]
      }
      expect(result.nodes[0]).toMatchObject({ size })
    }
  })
})

describe('normalizeLegacyBoard — images array-ification (schema v5)', () => {
  it('converts a pre-v5 { [id]: dataUri } images record into an array of {id, dataUri} entries', () => {
    const legacyDoc = {
      version: 4,
      nodes: [],
      edges: [],
      images: {
        img1: 'data:image/png;base64,aaa',
        img2: 'data:image/png;base64,bbb',
      },
    }
    const result = normalizeLegacyBoard(legacyDoc) as {
      images: { id: string; dataUri: string }[]
    }
    expect(result.images).toEqual(
      expect.arrayContaining([
        { id: 'img1', dataUri: 'data:image/png;base64,aaa' },
        { id: 'img2', dataUri: 'data:image/png;base64,bbb' },
      ]),
    )
    expect(result.images).toHaveLength(2)
  })

  it('leaves an already-array v5 images collection untouched', () => {
    const v5Doc = {
      version: SCHEMA_VERSION,
      nodes: [],
      edges: [],
      images: [{ id: 'img1', dataUri: 'data:x' }],
    }
    const result = normalizeLegacyBoard(v5Doc) as {
      images: { id: string; dataUri: string }[]
    }
    expect(result.images).toEqual([{ id: 'img1', dataUri: 'data:x' }])
  })

  it('falls back to an empty array for an unrecognizable images shape', () => {
    const doc = {
      version: SCHEMA_VERSION,
      nodes: [],
      edges: [],
      images: 'nope',
    }
    const result = normalizeLegacyBoard(doc) as { images: unknown[] }
    expect(result.images).toEqual([])
  })
})
