# Root board designated by `isRoot`, not `id === 'root'` (schema v6)

Supersedes the "reserved home board (`id === 'root'`)" convention in
`260917-multiboard-support-design.md` §1/§2 and everywhere downstream of it.

## Why

`'root'` was the only non-generated id in the data model: "a generated id
in most cases, but this one magic string once." That makes the schema
awkward for any backend whose ids aren't free-form strings, and doesn't
work with multiple users, since every user's home board would claim the
same id. The root board now has an ordinary generated id like every other
board. It's identified by a flag instead.

## The schema change

- `BoardMetaSchema` gains a **required** `isRoot: boolean`. It is never
  optional or defaulted on a v6 document.
- `BoardSchema` adds a refinement (`rootBoardIssues`,
  `src/schema/boardMeta.ts`): **exactly one** board has `isRoot: true`,
  and that board is not `trashed`. Zero roots, several roots, or a trashed
  root are all rejected, with a message that names the offending ids.
- `SCHEMA_VERSION` is now 6.
- Nothing in the data model treats an id as special any more. A v6 board
  whose id happens to be the string `'root'` is just a board.

## Runtime: "home" is a lookup, not an id

- `rootBoardIdAtom` (`src/state/atoms/currentBoard.ts`) derives the root
  id from the live document: `boards.find(b => b.isRoot).id`.
- `currentBoardIdAtom` is now writable-derived. The `/` route writes
  `undefined`, meaning "home", which resolves against the live document's
  root **at read time**. Local and Network mode each have their own root
  with different ids, so a mode switch while sitting on `/` has to
  re-resolve without navigating. A stored id would go stale.
- To avoid a circular import, the live document atom (`currentBoardAtom`)
  and the initial localStorage load moved out of `boardHistoryAtom.ts` into
  `src/state/history/liveBoard.ts`. The cycle would have been:
  currentBoard → boardHistoryAtom → currentBoard.
- Every "am I on root" check (card creation gating, ⌘N/paste gating,
  breadcrumb rename, `renameBoardAtom`, `createBoardAtom`) now compares
  against `rootBoardIdAtom` or reads `meta.isRoot`.
- Node/edge factories that don't yet know their board use
  `UNASSIGNED_BOARD_ID` (`''`) instead of borrowing the root id. The add
  atoms always overwrite it.
- `/$boardId` redirects to `/` when the id is the root's. This check runs
  *after* cross-mode access resolution, because the id may be the *other*
  mode's root.
- `removeEntitiesAtom` never trashes the root board, even if a hand-edited
  board node points at it. A trashed root would fail the next load.

## Local mode (localStorage): migrate on read

Developer decision: auto-migrate. Every earlier schema bump was handled
the same way (spec §9's "leniency is a feature").
`normalizeLegacyBoard` (`src/schema/legacy.ts`) treats any document not
stamped `version >= 6`, including unversioned and pre-v0 documents, as
pre-isRoot:

- It mints a fresh id for the board whose id was `'root'` and sets
  `isRoot: true` on it. Every other board gets `isRoot: false` and keeps
  its id.
- It rewrites every node/edge `boardId` and board-card `boardRef` that was
  `'root'` to the new id.
- If a pre-v6 document has no `'root'` board (every pre-v3 document, which
  had no `boards` array), it synthesizes one with a fresh id. This matches
  the earlier behavior.

A v6 document is **never** repaired. A missing `isRoot`, a missing root,
or a missing `boardId` fails `BoardSchema` and goes through the usual
corrupt-data recovery path (spec §9/Q12).

Known property: the migrated document is only written back on the next
autosave, i.e. the first edit. Until then, every reload migrates it again
and mints a *different* root id. That's harmless, because nothing persists
or links to the root's id (`/` never names it), but don't rely on the
migrated root id being stable before the first save.

## Network mode (REST): strict, no migration

Developer decision: don't do anything clever with server data. Every
network read is now validated against this app's own schemas:
`fetchCollection` takes a Zod schema, and `src/api/validateEntries.ts`
checks every entry. This covers `boards` (`BoardMetaSchema`), `nodes`,
`edges` and `images`. On top of that, `GET /boards` must satisfy
`rootBoardIssues`.

Unknown extra fields are allowed: the schemas are not `.strict()`, so an
entry carrying a field this app doesn't model (e.g. a stale `size` on a
link card left over from a hand-migrated v5 document) parses fine, and
the field is stripped before the entry reaches app state. Only a missing
or mistyped known field fails validation.

A mismatch throws a `ResponseValidationError` whose message names the
request, the entry id and the field, for example:

    GET /boards returned 1 invalid entry: id "root" (isRoot: Invalid input: expected boolean, received undefined)
    GET /boards: no board has isRoot: true — exactly one root board is required

The settings modal shows this inline instead of the generic "Could not
connect". Boot reconnect and navigation-triggered loads surface it as the
existing network-error toast. An empty `boards` collection now fails too:
a backend has to provide its own root board.

A board created over the network is POSTed with `isRoot: false` because
the full value is sent. Only the server-assigned `id` is read back from
the response; it isn't validated, since that response never becomes app
state wholesale.

## Fixtures

- `server/generate-db.ts`: the root board is `h0me0b0ard00`, with
  `isRoot: true`. Regenerate an existing dev database with
  `pnpm db:init -- --force`; an old `server/db.json` will fail validation.
- e2e: `ROOT_BOARD_ID` (`h0me0b0ard00`) is used for seeded local
  documents and `NETWORK_ROOT_ID` (`n3tw0rkr00t0`) for json-server data.
  The two are kept deliberately distinct so a spec can't pass only because
  both modes happen to share a root id.
