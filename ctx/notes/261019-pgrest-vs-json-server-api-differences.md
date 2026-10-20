# PostgREST vs json-server: API shape differences

Investigation only, no code changed. Compares what `src/api/` sends and
expects today (json-server v1) with the PostgREST v16 API described in
`ctx/support/261019-pgrest-kanvy-openapi.json`. Each item is marked as
**[spec]** (read straight from the OpenAPI doc), **[code]** (read from
this repo), or **[pgrst]** (PostgREST's documented behavior, not visible
in the OpenAPI doc; confirm against the live server).

## TL;DR: what breaks today, in request order

1. `testConnection`: `GET /boards?_page=1&_per_page=1`. PostgREST reads
   any non-reserved query param as a column filter, so `_page=1` is a
   filter with no operator → **400 PGRST100** ("failed to parse filter").
   This is probably the first error you saw.
2. `fetchAllPages`: same `_page`/`_per_page` params, and it also expects
   the `{ data, next, … }` envelope. PostgREST returns a bare array.
3. Filters: `?boardId=<id>`, `?status=trashed`, `?id:in=a,b`. PostgREST
   wants `?board_id=eq.<id>`, `?status=eq.trashed`, `?id=in.(a,b)`.
4. Item URLs: `PATCH`/`DELETE /nodes/<id>` → **404**. PostgREST has no
   path ids; it's `PATCH /nodes?id=eq.<id>`.
5. Bodies: camelCase keys (`boardId`, `nodeType`) → **400 PGRST204**
   ("Could not find the 'boardId' column").
6. `POST` response: by default PostgREST returns **201 with an empty
   body**, so `response.json()` throws and `created.id` is never read.

## 1. Naming: camelCase ↔ snake_case  [spec]

All columns are snake_case. The non-trivial mappings:

| app (camelCase) | pgrest column |
|---|---|
| `boardId` | `board_id` |
| `isRoot` | `is_root` |
| `nodeType` / `cardType` | `node_type` / `card_type` |
| `imageId` / `boardRef` | `image_id` / `board_ref` |
| `linkUrl` / `linkTitle` / `linkImageUrl` | `link_url` / `link_title` / `link_image_url` |
| `fromNodeId` / `fromSide` / `toNodeId` / `toSide` | `from_node_id` / `from_side` / `to_node_id` / `to_side` |
| `createdAt` / `updatedAt` | `created_at` / `updated_at` |
| `dataUri` | `data_uri` |

The mapping has to cover **four** places, not just response bodies:
response rows, request bodies (POST/PATCH), filter **keys** in query
strings (`board_id=eq.…`), and `select`/`order` column lists if those are
ever used. Values stay untouched. Enum values like `in_progress` and
`falling-triangles` are values, not keys, and already match the app.

[code] `networkIdRemap.resolveValueReferences` and `networkOps.patchBody`
work on camelCase keys. Case conversion belongs at the wire boundary
(after id resolution, just before `JSON.stringify`), so the ops layer can
stay backend-agnostic.

## 2. Filtering  [pgrst]

| purpose | json-server (today) | PostgREST |
|---|---|---|
| equality | `?boardId=x` | `?board_id=eq.x` |
| set membership | `?id:in=a,b` | `?id=in.(a,b)` |
| status | `?status=trashed` | `?status=eq.trashed` |

Call sites that build filters ([code]):
- `networkBoardLoader.ts:97`: `'id:in'` for images
- `networkBoardLoader.ts:106-107`: `{ boardId }` for nodes/edges
- `networkReaper.ts:58` `TRASHED`, `:100` `` `${field}:in` `` over
  `boardId`, `boardRef`, `fromNodeId`, `toNodeId`, `imageId`

These are all either equality or `in` filters, so a tiny filter IR such as
`{ field, op: 'eq' | 'in', value }` that each backend serializes would
cover every current use. `in.(…)` values with commas, parens or quotes
need double-quoting. UUIDs never contain those, but a generic serializer
should quote anyway.

## 3. Pagination  [pgrst]

| | json-server | PostgREST |
|---|---|---|
| request | `_page`, `_per_page` | `limit` + `offset` query params, **or** `Range: 0-199` + `Range-Unit: items` headers [spec: both listed] |
| response | `{ first, prev, next, last, pages, items, data }` | bare JSON array, `Content-Range: 0-199/*` header (`/total` only with `Prefer: count=exact`) |
| "last page" signal | `next === null` | page shorter than `limit` (or parse `Content-Range`) |
| ordering | insertion order | **unspecified** without `order=` |

Gotchas:
- **Offset paging without `order=` can skip or duplicate rows** across
  pages. Always send `order=id` or similar.
- **`db-max-rows`** (server config) silently caps every response, with
  no error. If it's lower than our page size, a "page shorter than limit
  → stop" loop would stop early and **drop rows silently**. The safe stop
  condition is "page came back empty", or comparing `Content-Range` with
  `Prefer: count=exact`.
- A partial `Range` request can return **206** instead of 200. It's still
  `response.ok`, so nothing breaks today, but worth knowing.

## 4. Single-entity writes  [pgrst]

PostgREST has no `/collection/:id` routes. Every PATCH/DELETE is a filter:
`PATCH /nodes?id=eq.<id>`.

- **Zero matches are not an error.** A PATCH/DELETE whose filter matches
  nothing returns **204**, where json-server returns **404**. Today a
  missing entity surfaces as a thrown error; on PostgREST it would
  silently no-op. To keep that behavior, send `Prefer: return=representation`
  (or `Prefer: count=exact` + read `Content-Range`) and treat an empty
  result as not-found.
- **A missing filter updates or deletes every row.** PostgREST only
  rejects that if `pg-safeupdate` is installed. The adapter should
  refuse to build a write URL without an `id` filter.

## 5. Create (POST)  [pgrst]

| | json-server | PostgREST |
|---|---|---|
| default 201 body | the created object | **empty** (`return=minimal`) |
| with `Prefer: return=representation` | n/a | a **one-element array** `[row]` |
| single object | default | `Accept: application/vnd.pgrst.object+json` [spec: listed in `produces`] |
| id when the client omits it | `randomId()` | `gen_random_uuid()` default [spec] |
| id when the client sends one | **overwritten** | **honored** (and must be a valid uuid) |

[code] `createEntity` returns `response.json()` and `networkOps` reads
`.id` off it. On PostgREST that needs `Prefer: return=representation`,
then either unwrapping `[0]` or sending the `vnd.pgrst.object+json`
Accept header. The response also needs snake→camel mapping before
`.id` is read (harmless for `id` itself, but `recordAndReconcile` should
get the mapped row).

**Design opportunity, not a requirement:** PostgREST honors
client-supplied ids. If the app minted UUIDs (`crypto.randomUUID()`)
instead of nanoids, network creates could keep their own ids, and the
whole id-reconciliation machinery (`networkIdRemap.ts`,
`entityReconcile.ts`, `networkReconcile.ts`) would become a no-op on this
backend. It's still needed for json-server, which overwrites.

## 6. Types and value formats

- **ids are `uuid`** [spec]. Any nanoid that reaches the wire (as an id
  filter or as an FK value) is a **400 / 22P02** ("invalid input syntax
  for type uuid"). json-server accepted any string. Today that can only
  happen if an op refers to an entity whose create never resolved (a
  failed POST earlier in the gesture, or a stale op). It used to fail
  softly; now it fails hard.
- **Enums are Postgres enums** (`app_data.side`, `app_data.task_status`,
  …) [spec]. They match the Zod enums exactly, as of this spec.
- **Timestamps** come back as `2026-10-19T12:34:56.123456+00:00`
  (microseconds, `+00:00`), not `…:56.123Z`. [code] Every consumer goes
  through `new Date(…)` (`reaper.ts`, `colors/recency.ts`,
  `RecencyIndicator.tsx`), which parses both. I found no string
  comparisons of timestamps. Round-tripping a server timestamp back in a
  PATCH (redo restoring `op.value.updatedAt`) is fine because Postgres
  accepts both.
- **`updated_at` defaults to `now()` only on insert** [spec]. Nothing in
  the spec shows a trigger. The client already sends `updatedAt` on every
  update, so this matches json-server, but a server-side trigger would
  fight the redo-restores-old-`updatedAt` behavior. Check the DDL.
- `x/y/w/h/position` are `double precision`, so they arrive as JSON
  numbers. (Postgres `numeric` would have arrived as strings. Not an
  issue here.)

## 7. Nulls and the node shape

PostgREST returns **every column on every row**. The DB `nodes` table is
one wide table with nullable kind-specific columns. So:

- A container row arrives with `content: null, card_type: null,
  size: null, link_url: null, …`. A text card arrives with
  `pattern: null, image_id: null, board_ref: null, link_*: null`.
- [code] Zod object schemas aren't `.strict()`, so null keys a member
  doesn't declare get **stripped**, and the `NodeSchema` union picks the
  right member. This should validate as-is once keys are camelCased.
- **The DB is looser than Zod** [spec]. `content`, `card_type`, `size`,
  `pattern`, `image_id`, `link_url`, `board_ref` are all nullable with no
  required-by-kind constraint visible. The OpenAPI doc can't show CHECK
  constraints, so the actual DDL might have them. A row the DB accepts
  (such as a text card with `size: null`) will be **rejected on read** by
  `validateEntries`, consistent with the "network reads are strict, never
  repaired" rule. Worth adding CHECK constraints so the DB can't hold rows
  the app refuses to load.
- **Don't use `nulls=stripped`** (offered in `produces`). `LinkCard`
  needs `linkTitle`/`linkImageUrl` *present* as `null`, so stripping them
  would fail validation.
- [code] `patchBody` already sends removed fields as explicit `null`.
  That's exactly what PostgREST needs, so no change there.

## 8. Foreign keys are real  [spec]

FKs: `nodes.board_id`, `nodes.board_ref` → `boards`; `nodes.image_id` →
`images`; `edges.board_id` → `boards`; `edges.from_node_id`/`to_node_id`
→ `nodes`. json-server enforced none of these.

- **Create order within a gesture matters**: an edge before its nodes, or
  a board card before its board, gives 409 / 23503. [code]
  `applyOpsToNetwork` is sequential, so it depends on the order the ops
  were recorded in. Worth auditing gestures that create several linked
  entities (paste with edges, new board + board card, duplicate-board)
  for ordering, since json-server would never have exposed a bad order.
- **Undo reverses order**, so undoing "create node + edge" PATCHes the
  edge first. Those are status PATCHes, not deletes, so FKs don't care.
- **Reaper**: already deletes edges → nodes → boards → images in
  dependency order, written with FKs in mind. The `ON DELETE` behavior
  (RESTRICT vs CASCADE) isn't in the spec. Check the DDL.
- A **409** with a Postgres code in the body is the new failure shape for
  ordering bugs.

## 9. Errors, auth, headers  [pgrst]

- **Error body** is JSON `{ code, message, details, hint }`, for example
  `PGRST100`, `PGRST204`, `22P02`, `23503`. [code] `throwIfNotOk` throws
  only `"<label> failed (<status>)"` and drops the body. Surfacing
  `message`/`hint` would make PostgREST misconfigurations much easier to
  debug.
- **Auth**: `Authorization: Bearer <jwt>` is the same header shape as
  today. Without a header, requests run as the configured anon role
  (`db-anon-role`). If that role has SELECT but not INSERT, reads work and
  writes fail with **401/403**, so a connection test can pass while saves
  fail. An expired or invalid JWT gives **401** with a `WWW-Authenticate`
  header.
- **Schema selection**: the tables live in schema `app_data` [spec,
  `format: app_data.*`]. If PostgREST exposes more than one schema
  (`db-schemas`), non-default schemas need the `Accept-Profile` (GET) and
  `Content-Profile` (POST/PATCH/DELETE) headers. If `app_data` is first or
  only, nothing is needed. This could be a per-connection setting.
- **CORS**: PostgREST allows all origins by default and handles preflight.
  `Prefer`, `Range` and `Accept-Profile` are non-simple headers, so every
  request gets a preflight. Fine, but if a reverse proxy sits in front, it
  has to allow them.

## 10. Bodies and limits

- [code] `JSON_SERVER_MAX_IMAGE_BYTES = 90_000` in `networkOps.ts` exists
  only because of json-server's ~100KB body limit. PostgREST has no
  default limit of its own; a proxy or Postgres config might. This should
  become a per-backend (or per-connection) value, not a constant.
- `images` carries `created_at` [spec], which `ImageEntrySchema` strips
  harmlessly.

## 11. Introspection: useful for detection and testing

- `GET /` returns this OpenAPI document [spec]. A cheap PostgREST
  connection test could be `GET /` (checking `info.title ===
  'PostgREST API'`), or `GET /boards?limit=1`. The OpenAPI response also
  lists the available tables and columns, so the adapter could check that
  the expected columns exist and fail the connection test with a useful
  "column `is_root` missing" message instead of a later Zod error.
- The `Server: postgrest/<version>` response header can be used for
  backend **auto-detection** if that's wanted (UX question for phase 2).

## 12. Optional PostgREST features, not needed for parity

Bulk insert (array body), bulk status PATCH by `in` filter (whole-gesture
tombstoning in one request), and RPC functions could later make one
gesture one transaction (PostgREST runs each request in its own
transaction). Today a gesture is N requests, and a mid-gesture failure
leaves partial state, the same as on json-server.

## Suggested adapter seam (for discussion, not decided)

Every difference above sits in one of these concerns. That suggests a
`BackendAdapter` interface the current `restClient` functions route
through:

1. `listUrl(collection, filters, page)` + `parseListPage(response)` →
   `{ rows, done }`
2. `itemWrite(collection, id)` → URL + extra headers
3. `createRequest(...)` + `parseCreated(response)` → one row
4. `toWire(row)` / `fromWire(row)` key mapping (identity for json-server)
5. `connectionTest(config)`
6. `parseError(response)` → message
7. capabilities: `maxImageBytes`, `honorsClientIds`

## Open questions to answer against the live server / DDL

- CHECK constraints on `nodes` per `node_type`/`card_type`? (§7)
- `ON DELETE` behavior of each FK? (§8)
- Any `updated_at` trigger? (§6)
- `db-max-rows` value? (§3)
- What can the anon role do, and is `app_data` the default schema? (§9)
- Is `pg-safeupdate` loaded? (§4)
