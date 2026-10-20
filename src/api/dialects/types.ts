// The backend dialect contract (ctx/notes/261020-network-dialects.md):
// everything about *how* a REST backend spells a request or shapes a
// response — paths, filter/pagination syntax, envelopes, field names,
// headers, error bodies — lives behind one `Dialect` object, so the rest
// of network mode (restClient, networkOps, the reaper, the board loader)
// only ever deals in this app's own collections, field names and values.
//
// Typing is deliberately asymmetric. Every method's *arguments* are typed
// strictly in this app's own terms; a dialect may implement a method with
// looser parameters (`collection: string`, `value: Record<string,
// unknown>`) and still satisfy the interface (parameters are
// contravariant) — the shape a future user-supplied dialect would take.
// Every method's *return* is strict, and since a dialect may eventually be
// user code, restClient re-checks each return against the Zod schemas
// below at runtime (`DialectContractError`) rather than trusting the type.
//
// Every method may return a promise (`MaybePromise`), so a dialect can
// later run in a web worker without changing this interface.

import { z } from 'zod'
import type { ImageEntry } from '../../schema/board'
import type { BoardMeta } from '../../schema/boardMeta'
import type { Edge } from '../../schema/edge'
import type { Node } from '../../schema/node'

export type MaybePromise<T> = T | Promise<T>

/** This app's entity type per REST collection (network mode design doc §5). */
export interface CollectionEntities {
  boards: BoardMeta
  nodes: Node
  edges: Edge
  images: ImageEntry
}

export type Collection = keyof CollectionEntities

/** Every key of every member of a union — `keyof Node` alone is only the keys all node kinds share. */
type KeysOfUnion<T> = T extends unknown ? keyof T : never

/** A field name of `C`'s entity, in this app's own (camelCase) spelling. */
export type FieldOf<C extends Collection> = KeysOfUnion<CollectionEntities[C]> &
  string

/** A field's value type, across every union member that has it. */
type FieldValue<T, K extends PropertyKey> = T extends unknown
  ? K extends keyof T
    ? T[K]
    : never
  : never

/**
 * A partial write of `C`'s entity. `null` means "blank this field" — a
 * field an update removes is sent as an explicit null (schema v7,
 * ctx/notes/261008-flat-link-fields.md).
 */
export type EntityPatch<C extends Collection> = {
  [K in FieldOf<C>]?: FieldValue<CollectionEntities[C], K> | null
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never

/** A create's value: the whole entity minus its `id` — the server assigns one (api/networkIdRemap.ts). */
export type EntityCreate<C extends Collection> = DistributiveOmit<
  CollectionEntities[C],
  'id'
>

/**
 * A server-side row filter, in this app's own field names — the dialect
 * spells it for the wire. `before` compares timestamps: the field's
 * value is strictly earlier than `value` (an ISO 8601 string).
 */
export type Filter<C extends Collection = Collection> =
  | { field: FieldOf<C>; op: 'eq'; value: string }
  | { field: FieldOf<C>; op: 'in'; values: readonly string[] }
  | { field: FieldOf<C>; op: 'before'; value: string }

/** Where `listRequest` should resume: `null` for the first page, otherwise whatever the previous `parseListResponse` returned as `next`. */
export type PageCursor = string | number

const HttpMethodSchema = z.enum(['GET', 'POST', 'PATCH', 'DELETE'])

/**
 * One HTTP request, relative to the connection's base URL. `query` is a
 * list of pairs (not a record) so a dialect can repeat a key. `body` is
 * JSON-serialized by restClient. Auth (`Authorization: Bearer …`) is
 * added by restClient, not the dialect — every dialect gets it the same
 * way.
 */
export const DialectRequestSchema = z.object({
  method: HttpMethodSchema,
  path: z
    .string()
    .min(1)
    .refine((path) => !/^[a-z][a-z0-9+.-]*:/i.test(path), {
      message: 'path must be relative to the base URL',
    }),
  query: z.array(z.tuple([z.string(), z.string()])).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
})
export type DialectRequest = z.infer<typeof DialectRequestSchema>

/** A received response, already read: lowercase header names, `body` parsed as JSON (`null` when empty, the raw text when it isn't JSON). */
export interface WireResponse {
  status: number
  headers: Readonly<Record<string, string>>
  body: unknown
}

/** One app-shaped (already field-mapped) row, not yet validated against its entity schema — restClient's caller does that (api/validateEntries.ts). */
const AppRowSchema = z.record(z.string(), z.unknown())

export const ListPageSchema = z.object({
  rows: z.array(AppRowSchema),
  next: z.union([z.string(), z.number(), z.null()]),
})
export type ListPage = z.infer<typeof ListPageSchema>

/** A created row: at least the server's own `id` for it. */
export const CreatedRowSchema = AppRowSchema.and(z.object({ id: z.string() }))
export type CreatedRow = z.infer<typeof CreatedRowSchema>

/** Whether an update/delete actually hit a row — a backend that answers a zero-row write with a success status (PostgREST: 204) must report `'not-found'` here, so a missing entity still fails loudly, as on json-server (404). */
export const WriteOutcomeSchema = z.enum(['ok', 'not-found'])
export type WriteOutcome = z.infer<typeof WriteOutcomeSchema>

const DialectLimitsSchema = z.object({
  /** Largest image data URI (bytes) one request may carry — `null` for no limit beyond spec §2.6's own downsizing. */
  maxImageBytes: z.number().int().positive().nullable(),
})
export type DialectLimits = z.infer<typeof DialectLimitsSchema>

export interface Dialect {
  /** Stable id — persisted with the connection settings, so never rename one. */
  readonly id: string
  /** Shown in the settings modal's preset dropdown. */
  readonly label: string
  /** The settings modal's base-URL placeholder for this dialect. */
  readonly exampleBaseUrl: string
  readonly limits: DialectLimits
  /**
   * Whether `deleteRequest` applies its `guards` server-side, in the same
   * request (so the row is deleted only if it still matches them at that
   * instant). When false, restClient checks the guards itself with a read
   * first — best effort, with a window between the check and the delete.
   */
  readonly atomicDeleteGuards: boolean

  /** A cheap, real, authenticated request the settings modal's Save & Connect runs first. */
  connectionTest(): MaybePromise<DialectRequest>

  /** One page of `collection`, narrowed by every one of `filters`. */
  listRequest<C extends Collection>(args: {
    collection: C
    filters: readonly Filter<C>[]
    cursor: PageCursor | null
  }): MaybePromise<DialectRequest>
  /** The page's rows (in this app's field names) and the cursor of the page after it, or `null` when this was the last. */
  parseListResponse<C extends Collection>(args: {
    collection: C
    cursor: PageCursor | null
    response: WireResponse
  }): MaybePromise<ListPage>

  createRequest<C extends Collection>(args: {
    collection: C
    value: EntityCreate<C>
  }): MaybePromise<DialectRequest>
  /** The created row in this app's field names — its `id` is the server's, whatever the request sent. */
  parseCreateResponse<C extends Collection>(args: {
    collection: C
    response: WireResponse
  }): MaybePromise<CreatedRow>

  updateRequest<C extends Collection>(args: {
    collection: C
    id: string
    patch: EntityPatch<C>
  }): MaybePromise<DialectRequest>
  /** `guards`: conditions the row must still meet to be deleted (see `atomicDeleteGuards`). A row that doesn't is reported `'not-found'` by `parseWriteResponse`. */
  deleteRequest<C extends Collection>(args: {
    collection: C
    id: string
    guards: readonly Filter<C>[]
  }): MaybePromise<DialectRequest>
  /** Only called for a successful (2xx) update or delete response. */
  parseWriteResponse<C extends Collection>(args: {
    collection: C
    method: 'PATCH' | 'DELETE'
    response: WireResponse
  }): MaybePromise<WriteOutcome>

  /** A human-readable reason for a failed (non-2xx) response, or `null` when the body has none — restClient appends it to its own "<request> failed (<status>)". */
  errorMessage(response: WireResponse): MaybePromise<string | null>
}

/** A dialect's parse method was handed a response it can't read — usually the wrong preset for this server. */
export class UnexpectedResponseError extends Error {
  override name = 'UnexpectedResponseError'
}

/** `body` as a plain JSON object, or an `UnexpectedResponseError` naming `what` was expected. */
export function expectObject(
  body: unknown,
  what: string,
): Record<string, unknown> {
  if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
    return body as Record<string, unknown>
  }
  throw new UnexpectedResponseError(`expected ${what} to be a JSON object`)
}

/** `body` as a JSON array of objects, or an `UnexpectedResponseError` naming `what` was expected. */
export function expectObjectArray(
  body: unknown,
  what: string,
): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.map((entry, index) => expectObject(entry, `${what}[${index}]`))
  }
  throw new UnexpectedResponseError(`expected ${what} to be a JSON array`)
}

/** A dialect returned something that breaks the contract above — a bug in the dialect itself, not the server. */
export class DialectContractError extends Error {
  override name = 'DialectContractError'
}
