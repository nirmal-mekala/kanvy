# Network backend dialects (presets)

Follows `261019-pgrest-vs-json-server-api-differences.md`. Network mode
now speaks more than one REST backend: the settings modal has a **Backend**
dropdown, and each entry is a *dialect*, an object that owns everything
backend-specific.

## Decision: presets, not user-built configs

We considered making every difference user-configurable (envelope,
pagination, filter syntax, etc.) and rejected it. About half of the
differences are *behavior*, not shape:

- whether a create returns its row
- whether a zero-row write is an error
- the paging stop rule under a server-side `db-max-rows` cap
- the error body format
- safety rules such as "never write without an id filter"

Expressing all of that would mean building a REST-description language
that users can't answer questions about. That approach can't be tested
combinatorially, and it fails silently (dropped rows, writes that do
nothing). So users pick a preset. The internals are still a typed,
mostly-function object, so a later "custom dialect" could be user code (in
a web worker) without changing the interface.

## Shape (`src/api/dialects/`)

- `types.ts` defines the `Dialect` interface and the contract's Zod schemas.
  - Data: `id` (persisted, so never rename one), `label`, `exampleBaseUrl`,
    `limits.maxImageBytes`.
  - Methods: `connectionTest`, `listRequest`/`parseListResponse`,
    `createRequest`/`parseCreateResponse`, `updateRequest`/`deleteRequest`/
    `parseWriteResponse`, `errorMessage`.
  - Request builders return a `DialectRequest`: method, base-relative path,
    query pairs, headers, body.
  - Parsers receive a `WireResponse`: status, lowercase headers, body
    already parsed as JSON. They return app-shaped rows.
- **Typing is asymmetric on purpose.** Arguments are strict, in app terms:
  `Collection`, `Filter<C>` over `FieldOf<C>`, `EntityCreate<C>`,
  `EntityPatch<C>`. A dialect may implement a method with *looser*
  parameters and still satisfy the interface, because parameters are
  contravariant. That is how a user-supplied dialect would be written; the
  built-in ones keep the strict types. Returns are strict, and
  `restClient` re-validates every return at runtime (`checked()` throws
  `DialectContractError`) because a dialect may eventually be untrusted
  code. That check also rejects absolute request paths, so a dialect can't
  send requests (and the bearer token) anywhere but the configured base
  URL.
- Every method may return a promise (`MaybePromise`), so a web-worker
  dialect needs no interface change.
- **Field mapping is part of the dialect, not the client.** Dialects take
  and return app-named fields. `fieldMapping.ts` (`createFieldMapping(
  casing, renames)`) is a building block they compose: snake/identity
  casing plus per-collection overrides such as
  `{ nodes: { position: 'item_pos' } }`.
- `registry.ts` holds `DIALECTS` (dropdown order), `DEFAULT_DIALECT_ID`
  (`json-server`), and `getDialect` (throws on an unknown id).
  `NetworkConfig.dialectId` is persisted next to the base URL
  (`kanvy-network-dialect`). On read it is normalized: missing or unknown
  becomes `json-server`, so a connection saved before presets existed
  keeps working.

## What the client still owns (`src/api/restClient.ts`)

- the bearer `Authorization` header (same for every dialect)
- the `Content-Type` of a JSON body
- URL joining
- the page loop (with a stuck-cursor guard and a page cap)
- refusing a write with an empty id
- turning `parseWriteResponse`'s `'not-found'` into a thrown 404-style
  `RequestFailedError`
- appending the dialect's `errorMessage` to `"<METHOD> /<path> failed
  (<status>)"`

The app's semantics stay in `networkOps`, outside both the client and
the dialects: removed fields become explicit `null`, and ids are remapped.

## PostgREST specifics (`postgrest.ts`)

- snake_case mapping
- `eq.` / `in.(…)` filters (quoted when needed)
- paging with `order=id`, `limit`/`offset` and `Prefer: count=exact`. The
  cursor advances by the rows actually returned and stops at the
  `Content-Range` total, or on an empty page when there is no total.
- POST sends `Prefer: return=representation` plus the
  `vnd.pgrst.object+json` Accept header
- PATCH/DELETE are addressed by `?id=eq.<id>&select=id` with
  `return=representation`; an empty array means `'not-found'`
- error text comes from `{code, message, hint}`
- no image size cap

## Testing

- Unit: `dialects/*.test.ts`, `restClient.test.ts` (both dialects, plus a
  deliberately loose dialect for contract enforcement), `networkOps.test.ts`,
  `networkSettings.test.ts`.
- e2e: `e2e/postgrestDialect.spec.ts` against a `page.route` fake
  (`e2e/fixtures/fakePostgrest.ts`), since there is no real PostgREST in
  the e2e environment.

## Guarded deletes

`deleteRequest` takes `guards` (conditions the row must still meet), and
`atomicDeleteGuards` says whether the dialect applies them in the same
request. PostgREST does; json-server doesn't, so `restClient` falls back
to read-then-delete. See `261020-safe-network-deletes.md`.

## Not done / open

- No live PostgREST run yet. The open questions in the 261019 note (CHECK
  constraints, `ON DELETE`, `updated_at` trigger, anon role, schema
  profile) still stand.
- No `Accept-Profile`/`Content-Profile` setting. Add one if `app_data`
  isn't PostgREST's default schema.
- No auto-detection of the backend.
