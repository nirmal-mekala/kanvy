import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { BoardMetaSchema } from '../schema/boardMeta'
import type { NetworkConfig } from '../state/atoms/networkSettings'
import * as registry from './dialects/registry'
import { type Dialect, DialectContractError } from './dialects/types'
import {
  createEntity,
  deleteEntity,
  fetchCollection,
  patchEntity,
  RequestFailedError,
  testConnection,
} from './restClient'
import { ResponseValidationError } from './validateEntries'

const IdOnlySchema = z.object({ id: z.string() })

const jsonServer: NetworkConfig = {
  baseUrl: 'http://x:1996',
  authToken: '',
  dialectId: 'json-server',
}
const postgrest: NetworkConfig = {
  baseUrl: 'http://pg:3000/',
  authToken: '',
  dialectId: 'postgrest',
}

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers,
  })
}

function paginated(data: unknown[], next: number | null = null): Response {
  return json({ first: 1, prev: null, next, last: 1, pages: 1, items: 0, data })
}

function calls(fetchImpl: ReturnType<typeof vi.fn>) {
  return fetchImpl.mock.calls.map(([url, init]) => ({
    url: new URL(url as string),
    init: init as RequestInit & { headers: Record<string, string> },
  }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('testConnection', () => {
  it("sends the json-server dialect's GET /boards?_page=1&_per_page=1 with no auth header when the token is blank", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(paginated([]))
    await testConnection(jsonServer, fetchImpl)
    const [call] = calls(fetchImpl)
    expect(call?.url.pathname).toBe('/boards')
    expect(call?.url.searchParams.get('_page')).toBe('1')
    expect(call?.url.searchParams.get('_per_page')).toBe('1')
    expect(call?.init.headers.Authorization).toBeUndefined()
  })

  it("sends the PostgREST dialect's GET /boards?select=id&limit=1", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json([]))
    await testConnection(postgrest, fetchImpl)
    const [call] = calls(fetchImpl)
    expect(call?.url.toString()).toBe('http://pg:3000/boards?select=id&limit=1')
  })

  it('sends Authorization: Bearer <token> when a token is set', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(paginated([]))
    await testConnection({ ...jsonServer, authToken: 'secret' }, fetchImpl)
    expect(calls(fetchImpl)[0]?.init.headers.Authorization).toBe(
      'Bearer secret',
    )
  })

  it("throws on a non-ok response, including the dialect's reading of the error body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(
        {
          code: 'PGRST100',
          message: 'failed to parse filter (1)',
          hint: null,
        },
        400,
      ),
    )
    const request = testConnection(postgrest, fetchImpl)
    await expect(request).rejects.toBeInstanceOf(RequestFailedError)
    await expect(request).rejects.toThrow(
      'GET /boards failed (400): PGRST100: failed to parse filter (1)',
    )
  })

  it('throws on a non-ok response with no readable body', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 401 }))
    await expect(testConnection(jsonServer, fetchImpl)).rejects.toThrow(
      /^GET \/boards failed \(401\)$/,
    )
  })
})

describe('fetchCollection', () => {
  it('spells filters in the dialect’s syntax (json-server: field=value, field:in=a,b)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(paginated([{ id: 'n1' }]))
    const result = await fetchCollection(
      jsonServer,
      'nodes',
      IdOnlySchema,
      [
        { field: 'boardId', op: 'eq', value: 'h0me0b0ard00' },
        { field: 'imageId', op: 'in', values: ['a', 'b'] },
      ],
      fetchImpl,
    )
    expect(result).toEqual([{ id: 'n1' }])
    const params = calls(fetchImpl)[0]?.url.searchParams
    expect(params?.get('boardId')).toBe('h0me0b0ard00')
    expect(params?.get('imageId:in')).toBe('a,b')
  })

  it('spells filters in the dialect’s syntax (PostgREST: snake_case column=eq.value / in.(…))', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json([]))
    await fetchCollection(
      postgrest,
      'nodes',
      IdOnlySchema,
      [
        { field: 'boardId', op: 'eq', value: 'b1' },
        { field: 'imageId', op: 'in', values: ['a', 'b'] },
      ],
      fetchImpl,
    )
    const params = calls(fetchImpl)[0]?.url.searchParams
    expect(params?.get('board_id')).toBe('eq.b1')
    expect(params?.get('image_id')).toBe('in.(a,b)')
    expect(params?.get('order')).toBe('id')
  })

  it('follows json-server pages until `next` is null', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(paginated([{ id: 'a' }, { id: 'b' }], 2))
      .mockResolvedValueOnce(paginated([{ id: 'c' }], null))
    const result = await fetchCollection(
      jsonServer,
      'boards',
      IdOnlySchema,
      [],
      fetchImpl,
    )
    expect(result.map((row) => row.id)).toEqual(['a', 'b', 'c'])
    expect(
      calls(fetchImpl).map((c) => c.url.searchParams.get('_page')),
    ).toEqual(['1', '2'])
  })

  it('follows PostgREST pages by offset until Content-Range says it has every row, camelCasing each one', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        json([{ id: 'a', is_root: true }], 200, { 'Content-Range': '0-0/2' }),
      )
      .mockResolvedValueOnce(
        json([{ id: 'b', is_root: false }], 200, { 'Content-Range': '1-1/2' }),
      )
    const result = await fetchCollection(
      postgrest,
      'boards',
      z.object({ id: z.string(), isRoot: z.boolean() }),
      [],
      fetchImpl,
    )
    expect(result).toEqual([
      { id: 'a', isRoot: true },
      { id: 'b', isRoot: false },
    ])
    expect(
      calls(fetchImpl).map((c) => c.url.searchParams.get('offset')),
    ).toEqual(['0', '1'])
  })

  it('rejects with a ResponseValidationError naming the entry and field when an entry fails its schema (e.g. a pre-v6 board with no isRoot)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      paginated([
        {
          id: 'root',
          title: 'Home',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    )
    const request = fetchCollection(
      jsonServer,
      'boards',
      BoardMetaSchema,
      [],
      fetchImpl,
    )
    await expect(request).rejects.toBeInstanceOf(ResponseValidationError)
    await expect(request).rejects.toThrow(
      /^GET \/boards returned 1 invalid entry: id "root" \(isRoot: .*boolean/,
    )
  })

  it('fails clearly when the server answers in another backend’s shape (the wrong preset)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json([{ id: 'a' }]))
    await expect(
      fetchCollection(jsonServer, 'boards', IdOnlySchema, [], fetchImpl),
    ).rejects.toThrow('expected GET /boards to be a JSON object')
  })
})

describe('createEntity', () => {
  it('json-server: POSTs the value as-is and returns the created row', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ id: 's1', title: 'T' }))
    const created = await createEntity(
      jsonServer,
      'images',
      { dataUri: 'data:x' },
      fetchImpl,
    )
    expect(created).toEqual({ id: 's1', title: 'T' })
    const [call] = calls(fetchImpl)
    expect(call?.init.method).toBe('POST')
    expect(call?.init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(call?.init.body as string)).toEqual({ dataUri: 'data:x' })
  })

  it('PostgREST: POSTs snake_case asking for the row back, and returns it camelCased', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(json({ id: 'uuid-1', data_uri: 'data:x' }, 201))
    const created = await createEntity(
      postgrest,
      'images',
      { dataUri: 'data:x' },
      fetchImpl,
    )
    expect(created).toEqual({ id: 'uuid-1', dataUri: 'data:x' })
    const [call] = calls(fetchImpl)
    expect(call?.url.toString()).toBe('http://pg:3000/images')
    expect(call?.init.headers.Prefer).toBe('return=representation')
    expect(call?.init.headers.Accept).toBe('application/vnd.pgrst.object+json')
    expect(JSON.parse(call?.init.body as string)).toEqual({
      data_uri: 'data:x',
    })
  })

  it('throws when the create response carries no id (e.g. PostgREST without return=representation)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(undefined, 201))
    await expect(
      createEntity(postgrest, 'images', { dataUri: 'data:x' }, fetchImpl),
    ).rejects.toThrow('expected POST /images to be a JSON object')
  })
})

describe('patchEntity / deleteEntity', () => {
  it('json-server: addresses the row by path', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => json({}))
    await patchEntity(jsonServer, 'boards', 'b1', { title: 'new' }, fetchImpl)
    await deleteEntity(jsonServer, 'boards', 'b1', [], fetchImpl)
    expect(
      calls(fetchImpl).map((c) => `${c.init.method} ${c.url.pathname}`),
    ).toEqual(['PATCH /boards/b1', 'DELETE /boards/b1'])
  })

  it('PostgREST: addresses the row by an id filter, with snake_case bodies and explicit nulls kept', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json([{ id: 'n1' }]))
    await patchEntity(
      postgrest,
      'nodes',
      'n1',
      { linkTitle: null, cardType: 'text' },
      fetchImpl,
    )
    const [call] = calls(fetchImpl)
    expect(call?.url.pathname).toBe('/nodes')
    expect(call?.url.searchParams.get('id')).toBe('eq.n1')
    expect(JSON.parse(call?.init.body as string)).toEqual({
      link_title: null,
      card_type: 'text',
    })
  })

  it('PostgREST: a write that matched no row (204-style empty result) throws, like a json-server 404', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => json([]))
    await expect(
      deleteEntity(postgrest, 'nodes', 'gone', [], fetchImpl),
    ).rejects.toThrow('DELETE /nodes failed: no such nodes entry')
    await expect(
      patchEntity(postgrest, 'nodes', 'gone', { x: 1 }, fetchImpl),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('refuses to write without an id, before asking the dialect or the server', async () => {
    const fetchImpl = vi.fn()
    await expect(
      deleteEntity(postgrest, 'nodes', '', [], fetchImpl),
    ).rejects.toThrow(/without an id/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('guarded deletes', () => {
  const guards = [
    { field: 'status', op: 'eq', value: 'trashed' },
    { field: 'updatedAt', op: 'before', value: '2026-10-01T00:00:00.000Z' },
  ] as const

  it('PostgREST: sends the guards as filters on the DELETE itself (atomic), with no read first', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json([{ id: 'n1' }]))
    await deleteEntity(postgrest, 'nodes', 'n1', guards, fetchImpl)
    const [call] = calls(fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(call?.init.method).toBe('DELETE')
    expect(call?.url.searchParams.get('status')).toBe('eq.trashed')
    expect(call?.url.searchParams.get('updated_at')).toBe(
      'lt.2026-10-01T00:00:00.000Z',
    )
  })

  it('PostgREST: a row that no longer meets the guards (empty result) is not-found', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json([]))
    await expect(
      deleteEntity(postgrest, 'nodes', 'n1', guards, fetchImpl),
    ).rejects.toThrow(/no longer meets the delete's conditions/)
  })

  it('json-server: reads the row first and deletes only if it meets every guard', async () => {
    const row = {
      id: 'n1',
      status: 'trashed',
      updatedAt: '2026-09-01T00:00:00.000Z',
    }
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(paginated([row]))
      .mockResolvedValueOnce(json({}))
    await deleteEntity(jsonServer, 'nodes', 'n1', guards, fetchImpl)
    expect(
      calls(fetchImpl).map((c) => `${c.init.method} ${c.url.pathname}`),
    ).toEqual(['GET /nodes', 'DELETE /nodes/n1'])
  })

  it.each([
    ['restored', { status: 'active', updatedAt: '2026-09-01T00:00:00.000Z' }],
    [
      're-trashed too recently',
      { status: 'trashed', updatedAt: '2026-10-02T00:00:00.000Z' },
    ],
  ])(
    'json-server: never sends the DELETE for a row that was %s',
    async (_label, fields) => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(paginated([{ id: 'n1', ...fields }]))
      await expect(
        deleteEntity(jsonServer, 'nodes', 'n1', guards, fetchImpl),
      ).rejects.toMatchObject({ status: 404 })
      expect(calls(fetchImpl).map((c) => c.init.method)).toEqual(['GET'])
    },
  )
})

describe('dialect contract enforcement', () => {
  /** A deliberately loose dialect (the shape a user-supplied one would take) — it must still type-check as a `Dialect`. */
  function looseDialect(overrides: Partial<Dialect> = {}): Dialect {
    const loose: Dialect = {
      id: 'loose',
      label: 'Loose',
      exampleBaseUrl: 'http://loose',
      limits: { maxImageBytes: null },
      atomicDeleteGuards: true,
      connectionTest: () => ({ method: 'GET', path: 'ping' }),
      listRequest: (args: { collection: string }) => ({
        method: 'GET',
        path: args.collection,
      }),
      parseListResponse: (args: { response: { body: unknown } }) =>
        Promise.resolve({ rows: args.response.body as never, next: null }),
      createRequest: (args: { collection: string; value: object }) => ({
        method: 'POST',
        path: args.collection,
        body: args.value,
      }),
      parseCreateResponse: () => ({ id: 'x' }),
      updateRequest: (args: { collection: string; id: string }) => ({
        method: 'PATCH',
        path: `${args.collection}/${args.id}`,
      }),
      deleteRequest: (args: { collection: string; id: string }) => ({
        method: 'DELETE',
        path: `${args.collection}/${args.id}`,
      }),
      parseWriteResponse: () => 'ok',
      errorMessage: () => null,
      ...overrides,
    }
    return loose
  }

  function withDialect(dialect: Dialect) {
    vi.spyOn(registry, 'getDialect').mockReturnValue(dialect)
    return { ...jsonServer, dialectId: dialect.id }
  }

  it('accepts a loosely-typed dialect whose async returns honor the contract', async () => {
    const config = withDialect(looseDialect())
    const fetchImpl = vi.fn().mockResolvedValue(json([{ id: 'a' }]))
    await expect(
      fetchCollection(config, 'boards', IdOnlySchema, [], fetchImpl),
    ).resolves.toEqual([{ id: 'a' }])
  })

  it('rejects a request with an absolute path (a dialect may not redirect requests off the base URL)', async () => {
    const config = withDialect(
      looseDialect({
        connectionTest: () => ({ method: 'GET', path: 'https://evil.test/x' }),
      }),
    )
    const request = testConnection(config, vi.fn())
    await expect(request).rejects.toBeInstanceOf(DialectContractError)
    await expect(request).rejects.toThrow(
      /connectionTest returned an invalid result — path/,
    )
  })

  it('rejects a malformed list page, naming the method', async () => {
    const config = withDialect(
      looseDialect({
        parseListResponse: () => ({ rows: 'nope', next: null }) as never,
      }),
    )
    await expect(
      fetchCollection(
        config,
        'boards',
        IdOnlySchema,
        [],
        vi.fn().mockResolvedValue(json([])),
      ),
    ).rejects.toThrow(/parseListResponse returned an invalid result — rows/)
  })

  it('rejects a cursor that never advances, instead of looping forever', async () => {
    const config = withDialect(
      looseDialect({ parseListResponse: () => ({ rows: [], next: 1 }) }),
    )
    const fetchImpl = vi.fn().mockImplementation(async () => json([]))
    await expect(
      fetchCollection(config, 'boards', IdOnlySchema, [], fetchImpl),
    ).rejects.toThrow(/returned the same cursor it was given \(1\)/)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('rejects a created row without a string id', async () => {
    const config = withDialect(
      looseDialect({ parseCreateResponse: () => ({ id: 7 }) as never }),
    )
    await expect(
      createEntity(
        config,
        'images',
        { dataUri: 'd' },
        vi.fn().mockResolvedValue(json({})),
      ),
    ).rejects.toThrow(/parseCreateResponse returned an invalid result — id/)
  })
})
