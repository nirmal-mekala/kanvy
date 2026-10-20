// The generic REST boundary network mode talks to (network mode design doc
// §1/§5/§6a). Every backend-specific detail — paths, filter and pagination
// syntax, envelopes, field names, extra headers, error bodies — is the
// connection's dialect's job (api/dialects/, ctx/notes/
// 261020-network-dialects.md). This module only sends what a dialect
// builds, adds the bearer auth header, and checks each dialect return
// against the contract's Zod schemas before trusting it.

import type { z } from 'zod'
import type { NetworkConfig } from '../state/atoms/networkSettings'
import { getDialect } from './dialects/registry'
import {
  type Collection,
  type CreatedRow,
  CreatedRowSchema,
  type Dialect,
  DialectContractError,
  type DialectRequest,
  DialectRequestSchema,
  type EntityCreate,
  type EntityPatch,
  type Filter,
  type ListPage,
  ListPageSchema,
  type MaybePromise,
  type PageCursor,
  type WireResponse,
  WriteOutcomeSchema,
} from './dialects/types'
import { validateEntries } from './validateEntries'

/** A list read stops (and throws) past this many pages — a guard against a dialect whose cursor never ends. */
const MAX_PAGES = 10_000

/** Thrown for a non-2xx response; `message` includes the dialect's reading of the error body, when it has one. */
export class RequestFailedError extends Error {
  override name = 'RequestFailedError'
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * A dialect method's return, checked against the contract — a dialect
 * (eventually user-supplied) can't hand restClient a malformed request or
 * page just because its types claimed otherwise.
 */
async function checked<S extends z.ZodType>(
  dialect: Dialect,
  method: string,
  schema: S,
  result: MaybePromise<unknown>,
): Promise<z.infer<S>> {
  const parsed = schema.safeParse(await result)
  if (parsed.success) return parsed.data
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join(', ')
  throw new DialectContractError(
    `The ${dialect.label} dialect's ${method} returned an invalid result — ${issues}`,
  )
}

function requestUrl(config: NetworkConfig, request: DialectRequest): string {
  const base = config.baseUrl.endsWith('/')
    ? config.baseUrl
    : `${config.baseUrl}/`
  const url = new URL(request.path, base)
  for (const [key, value] of request.query ?? []) {
    url.searchParams.append(key, value)
  }
  return url.toString()
}

/** `Authorization: Bearer <token>` when a token is set, no header at all when blank (design doc §2). */
function requestHeaders(
  config: NetworkConfig,
  request: DialectRequest,
): Record<string, string> {
  return {
    ...(request.body === undefined
      ? {}
      : { 'Content-Type': 'application/json' }),
    ...request.headers,
    ...(config.authToken
      ? { Authorization: `Bearer ${config.authToken}` }
      : {}),
  }
}

/** Reads `response` into a `WireResponse` — JSON when it parses, the raw text when it doesn't, `null` when empty. */
async function readResponse(response: Response): Promise<WireResponse> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })
  const text = await response.text()
  let body: unknown = null
  if (text.trim() !== '') {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  return { status: response.status, headers, body }
}

function requestLabel(request: DialectRequest): string {
  return `${request.method} /${request.path}`
}

/** Sends one dialect-built request; throws a `RequestFailedError` (with the dialect's error message, if any) for a non-2xx response. */
async function send(
  config: NetworkConfig,
  dialect: Dialect,
  request: DialectRequest,
  fetchImpl: typeof fetch,
): Promise<WireResponse> {
  const response = await fetchImpl(requestUrl(config, request), {
    method: request.method,
    headers: requestHeaders(config, request),
    ...(request.body === undefined
      ? {}
      : { body: JSON.stringify(request.body) }),
  })
  const wire = await readResponse(response)
  if (response.ok) return wire
  const detail = await dialect.errorMessage(wire)
  throw new RequestFailedError(
    `${requestLabel(request)} failed (${response.status})${detail ? `: ${detail}` : ''}`,
    response.status,
  )
}

/**
 * The settings modal's Confirm connection test (design doc §2/§10) — the
 * dialect's own cheap, real request against the configured base URL,
 * using the same auth header network mode's other requests will use.
 */
export async function testConnection(
  config: NetworkConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const dialect = getDialect(config.dialectId)
  const request = await checked(
    dialect,
    'connectionTest',
    DialectRequestSchema,
    dialect.connectionTest(),
  )
  await send(config, dialect, request, fetchImpl)
}

/** Every row of `collection` matching `filters`, page by page until the dialect reports no next page. */
async function fetchAllPages<C extends Collection>(
  config: NetworkConfig,
  dialect: Dialect,
  collection: C,
  filters: readonly Filter<C>[],
  fetchImpl: typeof fetch,
): Promise<ListPage['rows']> {
  const rows: ListPage['rows'] = []
  let cursor: PageCursor | null = null
  for (let pages = 0; pages < MAX_PAGES; pages++) {
    const request = await checked(
      dialect,
      'listRequest',
      DialectRequestSchema,
      dialect.listRequest({ collection, filters, cursor }),
    )
    const response = await send(config, dialect, request, fetchImpl)
    const page: ListPage = await checked(
      dialect,
      'parseListResponse',
      ListPageSchema,
      dialect.parseListResponse({ collection, cursor, response }),
    )
    rows.push(...page.rows)
    if (page.next === null) return rows
    if (page.next === cursor) {
      throw new DialectContractError(
        `The ${dialect.label} dialect's parseListResponse returned the same cursor it was given (${String(cursor)})`,
      )
    }
    cursor = page.next
  }
  throw new DialectContractError(
    `GET /${collection} didn't finish within ${MAX_PAGES} pages`,
  )
}

/**
 * Fetches every entry of `collection` (paginated in full, design doc §6a)
 * matching every one of `filters`, and validates each one against
 * `schema` — a response that doesn't match throws a
 * `ResponseValidationError` (api/validateEntries.ts) naming the offending
 * entries rather than letting them into app state.
 */
export async function fetchCollection<
  C extends Collection,
  S extends z.ZodType,
>(
  config: NetworkConfig,
  collection: C,
  schema: S,
  filters: readonly Filter<C>[] = [],
  fetchImpl: typeof fetch = fetch,
): Promise<z.infer<S>[]> {
  const dialect = getDialect(config.dialectId)
  const entries = await fetchAllPages(
    config,
    dialect,
    collection,
    filters,
    fetchImpl,
  )
  return validateEntries(schema, entries, `GET /${collection}`)
}

/**
 * Creates an entity and returns the server's own record of it — callers
 * must read the returned `id` rather than assume one was honored (REST
 * backends are free to assign their own; network mode's write path
 * (api/networkOps.ts) treats whatever comes back here as that entity's
 * canonical id from then on — see api/networkIdRemap.ts).
 */
export async function createEntity<C extends Collection>(
  config: NetworkConfig,
  collection: C,
  value: EntityCreate<C>,
  fetchImpl: typeof fetch = fetch,
): Promise<CreatedRow> {
  const dialect = getDialect(config.dialectId)
  const request = await checked(
    dialect,
    'createRequest',
    DialectRequestSchema,
    dialect.createRequest({ collection, value }),
  )
  const response = await send(config, dialect, request, fetchImpl)
  return checked(
    dialect,
    'parseCreateResponse',
    CreatedRowSchema,
    dialect.parseCreateResponse({ collection, response }),
  )
}

/** Sends a dialect-built update/delete, and throws when the dialect reports it matched no row. */
async function writeOne(
  config: NetworkConfig,
  dialect: Dialect,
  collection: Collection,
  method: 'PATCH' | 'DELETE',
  request: DialectRequest,
  fetchImpl: typeof fetch,
): Promise<void> {
  const response = await send(config, dialect, request, fetchImpl)
  const outcome = await checked(
    dialect,
    'parseWriteResponse',
    WriteOutcomeSchema,
    dialect.parseWriteResponse({ collection, method, response }),
  )
  if (outcome === 'not-found') throw notFound(request, collection)
}

function notFound(
  request: DialectRequest,
  collection: Collection,
): RequestFailedError {
  return new RequestFailedError(
    `${requestLabel(request)} failed: no such ${collection} entry (or it no longer meets the delete's conditions)`,
    404,
  )
}

/** Whether `row` (app-shaped) meets `guard` — restClient's own evaluation, for a dialect that can't apply guards server-side. */
function rowMeetsGuard(row: Record<string, unknown>, guard: Filter): boolean {
  const value = row[guard.field]
  switch (guard.op) {
    case 'eq':
      return String(value) === guard.value
    case 'in':
      return guard.values.includes(String(value))
    case 'before':
      return (
        typeof value === 'string' && Date.parse(value) < Date.parse(guard.value)
      )
  }
}

function requireId(collection: Collection, id: string): void {
  if (id === '') {
    throw new Error(`Refusing to write to ${collection} without an id`)
  }
}

export async function patchEntity<C extends Collection>(
  config: NetworkConfig,
  collection: C,
  id: string,
  patch: EntityPatch<C>,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  requireId(collection, id)
  const dialect = getDialect(config.dialectId)
  const request = await checked(
    dialect,
    'updateRequest',
    DialectRequestSchema,
    dialect.updateRequest({ collection, id, patch }),
  )
  await writeOne(config, dialect, collection, 'PATCH', request, fetchImpl)
}

/**
 * Deletes one row — only if it still meets every one of `guards` (this
 * app's own field names), so a delete planned from an earlier read can't
 * remove a row that has since changed (e.g. a trashed board restored in
 * the meantime). A row that's gone or fails a guard throws the same
 * not-found `RequestFailedError`. Atomic on a dialect with
 * `atomicDeleteGuards`; otherwise a read-then-delete, best effort.
 */
export async function deleteEntity<C extends Collection>(
  config: NetworkConfig,
  collection: C,
  id: string,
  guards: readonly Filter<C>[] = [],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  requireId(collection, id)
  const dialect = getDialect(config.dialectId)
  const request = await checked(
    dialect,
    'deleteRequest',
    DialectRequestSchema,
    dialect.deleteRequest({ collection, id, guards }),
  )
  if (guards.length > 0 && !dialect.atomicDeleteGuards) {
    const [row] = await fetchAllPages(
      config,
      dialect,
      collection,
      [{ field: 'id', op: 'eq', value: id } as Filter<C>],
      fetchImpl,
    )
    if (!row || !guards.every((guard) => rowMeetsGuard(row, guard))) {
      throw notFound(request, collection)
    }
  }
  await writeOne(config, dialect, collection, 'DELETE', request, fetchImpl)
}
