# Network mode / backend integration

## Read first

- `ctx/notes/260923-network-mode-backend-integration-design.md` — the
  design doc this directive implements. Read it in full before starting;
  it has the rationale and the decisions this directive only summarizes
  as steps.
- `ctx/notes/260921-action-based-undo-and-tombstoning.md` — the ops
  model (`state/ops.ts`) this work builds on. Its "nothing here is
  built" framing is now stale — the ops model is fully implemented; only
  its §3 (TanStack Query as the mutation layer) remains undone, and
  that's what this directive covers.
- `AGENTS.md` — general working conventions for this repo. In
  particular: don't resolve/remove existing `TODO`s you encounter, don't
  add features beyond what's described here, and if a change looks like
  it would alter behavior beyond what's described below, stop and ask
  rather than guessing.
- `ctx/support/260923-json-server-docs.md` — json-server reference
  (pagination params, REST conventions).

No auth/sign-in system is in scope. "Auth token" throughout is a single
user-supplied bearer string sent as `Authorization: Bearer <token>` —
nothing more.

## Scope

Two access modes for the app: **Local** (today's `localStorage`
behavior) and **Network** (a REST backend, json-server for now). Modes
are "ships in the night" — switching never migrates data either
direction, and network settings are in-memory only (reset on reload).
Full read/write in network mode from the start — this is not a
read-only-first pass. See the design doc for the reasoning behind each
of these calls.

## Suggested sequencing

Reshuffle freely if a later step turns out to depend on something not
yet in place — this is a starting point, not a strict order.

1. **Schema: array-ify `images`** (design doc §4). Change
   `Board.images` from `Record<string, string>` to `{id, dataUri}[]`,
   bump `SCHEMA_VERSION` to 5, add the `schema/legacy.ts` migration, and
   update every current reader/writer of `board.images`
   (`state/atoms/images.ts`, `pruneOrphanedImages.ts`, `ops.ts`'s
   `ImageOp` handling, serialize/import). This is independent local-mode
   prep — land and test it on its own before touching anything network-
   related.

2. **`db.json` + json-server setup.** Stand up a sample `db.json` with
   `boards`/`nodes`/`edges`/`images` collections (design doc §5),
   derived from `ctx/support/260915-kanvy-schema.json` /
   `260915-kanvy-db-sample.json`, updated for the post-step-1 `images`
   shape. Run json-server on one of ports 1993–1998; run the Vite dev
   server on another. Confirm you can `curl` all four collections before
   writing any app code against them.

3. **Pagination-loop fetch helper.** A shared, tested utility that
   fetches an entire json-server collection across pages (`_page`/
   `_per_page`) rather than one unbounded request — every "fetch all"
   read in this directive goes through it (design doc §6a).

4. **Settings modal + mode state.** Cog-icon button in `Toolbar.tsx`
   (rightmost of the existing icon row), opening a modal per design doc
   §2: Local/Network toggle with distinct iconography, base-URL + auth-
   token fields shown only in Network, a Confirm button that tests the
   connection before applying. Mode/settings live in-memory (a plain
   atom, no persistence layer). Hide the Upload button when in network
   mode (design doc §3); Download stays unaffected.

5. **Read path.** Bring both modes' initial board load through TanStack
   Query (design doc §6d) — local mode keeps its synchronous
   `localStorage` read under the hood but exposed the same way network
   mode is. Implement home-board blocking fetch (boards + home-board-
   scoped nodes/edges/images), background eager-load of other boards'
   data, and board-navigation fetch-if-not-yet-loaded (design doc
   §6a–6c). Add loading UI at each of these points.

6. **Write path.** Extend (or branch) `saveBoard`
   (`src/api/boardApi.ts`) so that in network mode, `pending.ops`
   (already threaded through `boardHistoryAtom.ts`'s debounced saver) map
   to real per-entity REST calls per the design doc §5 table
   (`CreateOp`→`POST`, `UpdateOp`→`PATCH`, `ImageOp`→
   `POST`/`PATCH`/`DELETE`), batched under one TanStack Query mutation
   per gesture. Local mode's write path (`writeBoard`, whole-document)
   is unchanged.

7. **Error handling.** Non-blocking banner + retry for network read/write
   failures, reusing the existing recovery-banner/toast patterns (design
   doc §7) — not a new blocking error surface.

8. **Tests + docs.** Vitest coverage for the pagination helper, the
   schema migration, and the op→REST-call mapping. Playwright coverage
   for the settings modal flow (toggle, connection-test failure, connection-
   test success + apply) and a basic network-mode board load/edit round
   trip against the json-server instance from step 2 (see
   `AGENTS.md`'s `playwright-remote-browser` note for how e2e runs in
   this container). Update `AGENTS.md`'s stack section if anything here
   changes a stack-level decision (e.g. adds json-server as a dev
   dependency) — do not add a changelog/test-pass-count entry, per
   `AGENTS.md`'s own standing instruction against that.

## Explicitly out of scope for this pass

- Any auth/sign-in flow beyond the single bearer-token header.
- Persisting network settings across reloads.
- Migrating data between local and network on mode switch.
- A non-json-server REST backend (design for it generically where free,
  don't build against it).
- `ReorderOp`/`ReplaceBoardOp` REST mapping (currently unreachable /
  hidden in network mode respectively — see design doc §5, §10).

If you find yourself needing to touch any of these to make the above
work, stop and ask rather than expanding scope.
