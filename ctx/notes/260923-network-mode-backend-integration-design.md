# Network mode / backend integration: design notes

## Status of this document

Design notes from a conversation between the developer and an agent,
capturing decisions already made plus the open questions still flagged
for whoever implements this — not itself an implementation plan (see
`ctx/prompt/260923-network-mode-backend-integration.md` for the
actionable directive). Nothing described here is built yet.

No auth/sign-in system is in scope. "Auth token" below is a single
user-supplied bearer string forwarded as a header — there's no login
flow, no token refresh, no per-user identity.

## Terminology note (avoids a naming collision)

Two different things are both called "board" in this doc and in the
existing code, and they don't mean the same thing:

- **`BoardMeta` entity** (`schema/boardMeta.ts`, the `boards` collection,
  `EntityKind: 'board'` in `state/ops.ts`) — a board's metadata record
  (id, title, status). This is what a REST `boards` collection holds.
- **A `kind: 'board'` node** (`schema/node.ts`) — an ordinary card, living
  on some board's canvas, that *links to* another board (a "sub-board
  card"). This is what the developer means by "board nodes" in the fetch
  scope below — a card, not a `BoardMeta` row.

## 1. Two modes: Local and Network

- **Local** (today's behavior, unchanged in spirit): reads/writes
  `localStorage` via `state/persistence/storage.ts`.
- **Network**: reads/writes a REST backend (json-server for now; the
  wire contract should stay generic enough that a different REST backend
  can eventually sit behind the same client — see §4).
- **Ships in the night**: switching modes never migrates data either
  direction. Network data is never written to `localStorage`; local data
  is never pushed to the network. Each mode's state is independent and
  un-synced. This may change later — not now.
- **Settings persist in-memory only**, for this pass — mode, base URL,
  and auth token all reset to local-mode defaults on reload. No
  localStorage key for settings yet (deliberately, to keep local-mode and
  network-mode storage fully separate for now — a persisted-settings
  follow-up is expected later).
- Switching mode, or changing base URL/token while already in network
  mode, only takes effect when the settings modal's **Confirm** button is
  pressed, and Confirm **tests the connection first** — on failure, the
  modal stays open showing an error instead of applying the change.

## 2. Settings UI

A cog-icon button, added to `Toolbar.tsx`'s icon row (rightmost, after
the existing Eye / theme / Upload / Download group), opens a modal.

Modal contents:
1. A Local/Network toggle at the top, with distinct iconography per mode
   (e.g. a `HardDrive`/`Cloud` pairing from `lucide-react`, matching the
   rest of the toolbar's icon sourcing).
2. When **Network** is selected, two fields appear:
   - **Base URL** — the REST backend's root (e.g.
     `http://localhost:1994`).
   - **Auth token** — optional. When set, every request sends
     `Authorization: Bearer <token>`. When blank, no `Authorization`
     header is sent at all.
3. **Confirm** — tests the connection (a lightweight request against the
   configured base URL) before applying. Success closes the modal and
   applies the new mode/settings; failure keeps the modal open with an
   inline error.

No settings take effect without pressing Confirm — changing the toggle
or typing in the fields doesn't touch app state until then.

## 3. Upload button in network mode

The `Upload` (import-JSON) button in `Toolbar.tsx` is hidden while in
network mode. `Download` (export) is unaffected — it exports whatever
board is currently materialized in app state regardless of mode, and
nothing about export is mode-specific.

## 4. Schema prerequisite: `images` needs to become an array

`Board.images` is currently `z.record(z.string(), z.string())` — a
`{ [id]: dataUri }` map (`schema/board.ts`). json-server (and REST
collections generally) need array-shaped collections with an `id` field
per entry, not a bare record. This needs to become:

```ts
images: z.array(z.object({ id: z.string(), dataUri: z.string() }))
```

This is a breaking schema change — bump `SCHEMA_VERSION` (currently 4 →
5) and add a migration step in `schema/legacy.ts`, same pattern as prior
revisions (v0.1 spatial containers, v3 multiboard, v4
tombstoning/ordering). Every current reader/writer of `board.images`
(`state/atoms/images.ts`, `pruneOrphanedImages.ts`, `ops.ts`'s `ImageOp`,
serialize/import) needs updating for the new shape — this is a real,
mechanical pass, not a drop-in type change. **Do this first**, as
prep work independent of everything else in this doc — it's a local-mode
schema fix as much as a network-mode enabler.

## 5. REST resource mapping

Given the array-ified schema, the natural json-server collections are:

- `boards` ← `Board.boards` (`BoardMeta[]`)
- `nodes` ← `Board.nodes` (`Node[]`, already flat + `boardId`-scoped
  since multiboard/v3)
- `edges` ← `Board.edges` (`Edge[]`, already flat + `boardId`-scoped)
- `images` ← `Board.images` (post-§4 array)

This mapping is not incidental — it already matches the four `EntityKind`
buckets the **ops model** (`state/ops.ts`) hand-authors at every mutation
call site (schema v4, see `260921-action-based-undo-and-tombstoning.md`
§2a), plus the separate `ImageOp` kind. That ops model is *already fully
built* (contrary to the 260921 doc's original "nothing here is built"
framing, which is now stale) — every mutation atom in `nodes.ts`/
`edges.ts`/`boards.ts` already constructs `CreateOp`/`UpdateOp`/`ImageOp`
directly, and `boardHistoryAtom.ts` already threads the accumulated
`ops` for a gesture through to its debounced save as `PendingSave.ops` —
today unused by the write itself (`saveBoard(pending.board)` still does a
whole-document `writeBoard`), but present and ready.

This is the extension point: **network-mode mutations should map each op
in `pending.ops` to a real per-entity REST call**, batched under one
TanStack Query mutation per gesture (per the developer's explicit
preference — real per-entity calls, not a whole-document write):

| Op kind | REST call |
|---|---|
| `CreateOp` | `POST /<collection>` (collection per `entity`: `boards`/`nodes`/`edges`) |
| `UpdateOp` | `PATCH /<collection>/:id` with `after`'s changed fields (covers tombstoning — `{status: 'trashed'}` — and index changes, same as today) |
| `ImageOp` | `POST /images` (create) or `PATCH /images/:id` (update) or `DELETE /images/:id` (when `after` is `undefined`) |
| `ReorderOp` | Currently unreachable from the UI (see 260921 doc's addendum) — no REST mapping needed yet; flag as a gap if it ever becomes reachable. |
| `ReplaceBoardOp` | Only produced by JSON import, which is already hidden in network mode (§3) — no REST mapping needed. |

Local mode's `saveBoard` internals stay exactly as they are today
(`writeBoard`, whole-document localStorage write) — only network mode's
internals branch to per-op REST calls. `pending.board` still gets passed
through either way, so nothing about the existing debounce/merge/gesture
batching in `boardHistoryAtom.ts` needs to change — only what `saveBoard`
(or its mode-aware replacement) does with `pending.ops` when in network
mode.

## 6. Read path

### 6a. Home-board load (blocking)

On loading the home board (`ROOT_BOARD_ID`), fetch and block on:
- all `boards` (so the full board list/titles can render)
- all `nodes` whose `boardId === ROOT_BOARD_ID` (regardless of `kind` —
  home board's own content, which today is only `board`/`container`
  kinds, but the fetch itself isn't kind-filtered)
- all `edges` whose `boardId === ROOT_BOARD_ID`
- all `images` referenced by those nodes

Any endpoint that could return an unbounded result set (`boards`, and
`nodes`/`edges`/`images` before they're `boardId`-filtered server-side,
if the backend doesn't support that filter) must be fetched in a loop
using json-server's pagination (`_page`/`_per_page` — see
`ctx/support/260923-json-server-docs.md`), never a single unbounded
request. Write this as one shared "fetch all pages" helper, not
duplicated per resource — every "fetch all" request in this doc should
go through it.

### 6b. Background eager-load of other boards

After the home board's own data has loaded, eagerly fetch every other
board's nodes/edges/images in the background, non-blocking. This is
explicitly *not* gated on the user navigating there — the goal is that by
the time they click into a board, its data is usually already resident.

### 6c. Board navigation

When the user navigates to a specific board (`/$boardId`):
- If that board's data has already loaded via the background prefetch
  (§6b), navigate immediately.
- If not yet loaded, block navigation on fetching that board's own
  nodes/edges/images before rendering it.

Add loading UI wherever it's user-visible: the home board's initial
load, the (should-usually-be-invisible) per-board navigation wait when
prefetch hasn't caught up yet, and the settings modal's Confirm
connection test.

### 6d. Local-mode parity

Today, local-mode's initial board load is synchronous and happens at
module scope (`boardHistoryAtom.ts`'s `const initialLoad: LoadResult =
loadBoard()`), with no TanStack Query involvement — `boardApi.ts`'s
`fetchBoard` already exists as an async wrapper around it but isn't
wired in anywhere. This work should bring local mode into the same
query-driven shape as network mode: both modes' reads flow through
TanStack Query, even though local mode's underlying operation stays a
synchronous `localStorage` read wrapped in a resolved promise. This is
listed as in-scope per the developer's explicit ask for read/write
parity across modes, not an optional nice-to-have.

## 7. Error handling

Network fetch failures (unreachable server, bad base URL, 401 from a bad
token, etc.) surface as a **non-blocking banner with a retry action**,
matching the existing corrupt-localStorage recovery pattern
(`storage.ts` / `RecoveryBanner`) — not a full-screen blocking error
state. The view stays on its last-good state underneath the banner.

## 8. Dev tooling / ports

Ports **1993–1998** are bound host↔container for this environment. Use
two of them: one for the Vite UI dev server, one for the json-server
instance. `ctx/support/260915-kanvy-schema.json` and
`260915-kanvy-db-sample.json` are the starting points for a sample
`db.json` — regenerate/extend them to match the post-§4 array-ified
`images` shape and the `boards`/`nodes`/`edges`/`images` collection
split.

## 9. Docs/tests

Keep `AGENTS.md` (stack/architecture summary), this doc, and the prompt
directive in sync with whatever actually lands — same standing
expectation as the rest of this repo's process. Every new module needs
its usual Vitest coverage (pure functions: pagination-loop helper, REST
op-to-call mapping, schema migration) — e2e/Playwright coverage for the
settings modal and mode-switch flow, per the existing test-tier split in
`AGENTS.md`.

## 10. Open questions (flagging, not deciding)

- **Prefetch strategy for §6b** — sequential (one board at a time) vs.
  some bounded concurrency? Not decided; start simple (sequential) unless
  it proves too slow against realistic board counts.

sequential.

when a board is navigated to, it should immediately jump to top priority and
start fetching immediately.

- **In-flight network mutation on mode switch** — if a debounced save is
  still pending/in-flight against the network when the user switches back
  to local, does it complete fire-and-forget, or get cancelled? Leaning
  fire-and-forget (simplest, and "ships in the night" already implies the
  two states don't need to reconcile), but not explicitly decided.

im okay with fire and forget. this feels like an edge case

- **Connection-test request shape** — what exactly does Confirm's
  connection test hit (`GET /boards?_page=1&_per_page=1`, a bare `GET
  /`, something else)? Left to the implementer; should be cheap and use
  the same auth header the rest of network mode will use.

former sounds good to me.

- **Reorder/replace-board op gap (§5)** — noted as currently
  unreachable/out-of-scope; flag rather than silently drop if either
  becomes reachable later.

yeah out of scope…
