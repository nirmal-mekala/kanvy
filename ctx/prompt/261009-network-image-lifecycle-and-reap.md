# Network mode: keep images through undo, and reap trashed entities server-side

You are picking this up with no access to the developer. Every product
decision below has already been made with them; do not re-open them. If you
hit something genuinely not covered here, choose the option most consistent
with the decisions below and existing code, and record what you chose (and
why) in the ctx note you write (see "Deliverables").

Read `AGENTS.md` first, plus the ctx notes it lists, and these in particular:

- `ctx/notes/260921-action-based-undo-and-tombstoning.md`: tombstoning and
  the deferred-sweep image lifecycle (its Q3 answer: "deferred reaper sweep
  is OK w me").
- `ctx/notes/260923-network-mode-backend-integration-design.md`
- `ctx/notes/260925-network-id-reconciliation.md`
- `ctx/notes/261008-network-undo-redo.md`: the replay table this task
  changes.

## Background: why this exists

The developer is building a Postgres + PostgREST backend to sit alongside
json-server (the app has always aimed for swappable backends). In their
schema:

- `nodes.board_id → boards(id) ON DELETE CASCADE`
- `nodes.image_id → images(id) ON DELETE RESTRICT`. The developer owns
  the DDL. **Do not write any SQL/DDL**, and treat these foreign-key semantics as
  given.

`RESTRICT` means "you may not delete an image while any node row, live
*or trashed*, references it; hard-delete those nodes first". Today's
client breaks that in network mode:

- Image ops are only ever creates. `addNodeAtom` and `replaceNodeAtom`
  (`src/state/atoms/nodes.ts`) always use a freshly generated `imageId`, so
  `ImageOp.before` is always `undefined` when the op is made. The image op is
  placed *before* the node op in the batch.
- Undo replays a batch in reverse (`src/api/networkOps.ts`
  `applyOpsToNetwork`). Undoing a paste therefore (1) tombstones the node
  with `PATCH {status:'trashed'}` (the row stays, still referencing the image), then
  (2) `DELETE /images/:id` (`applyImageOp`; images have no `status`).
  Under `RESTRICT`, (2) fails. Under `CASCADE`, it would silently hard-delete
  the trashed node, and redo, which only PATCHes `status:'active'`, would
  then 404.
- Network mode never hard-deletes anything else. `reapEntities`
  (`src/state/reaper.ts`) runs only for local mode
  (`src/state/history/liveBoard.ts` and `switchToLocalMode` in
  `src/state/networkBoardLoader.ts`). `initializeNetworkMode` doesn't reap,
  and the image undo is the only caller of `deleteEntity`
  (`src/api/restClient.ts`). Trashed nodes, edges and boards live on the
  server forever.

Images are never deduplicated by content. Two pastes of identical
bytes produce two `images` rows. In-app copy/paste, ⌘/Ctrl+D duplicate and
board duplication (`src/clipboard/`) copy nodes with `...node`, so they
**share** the source's `imageId`, possibly across boards. So
`nodes.image_id → images.id` is many-to-one, and "is this image orphaned?"
can only be answered by checking the server, not the client's partially
loaded document.

## Decisions (made with the developer, final)

1. **Undo of an image create must not delete the image on the server.**
   The image stays until its last referencing node is reaped (the same
   deferred sweep as local mode).
2. **Build a network-mode reaper** that hard-deletes aged trashed
   entities on the server, ordered so the foreign keys above (and plausible
   `RESTRICT` foreign keys elsewhere) never reject a delete.
3. **Orphan discovery is limited to the nodes reaped in this pass.** No full `GET /images`
   scan (json-server 1.0.0-beta.15 has no field selection, so listing
   image ids would download every data URI). Accepted, documented leak:
   images orphaned by something other than a reap stay on the server
   forever. Examples: converting an image card to text, or undoing an
   image-paste-onto-existing-card (that undo PATCHes the node back to text,
   leaving no reference). A Postgres-side job may clean these up later; note
   it as a follow-up and don't build it.
4. **Trigger: background, after network init.** Fire and forget after
   `initializeNetworkMode`'s blocking home-board load succeeds. Never block
   rendering. Query the server directly for reap candidates; don't rely on
   the eagerly-loaded document.
5. **Fix the tombstone timestamp on undo of a create.** `applyReplayedCreate`
   (`src/api/networkOps.ts`) currently PATCHes `{status}` only, so the server
   copy keeps its creation-time `updatedAt`, and the reap age is measured
   from `updatedAt`.
   - Undo sends `{ status: 'trashed', updatedAt: <now ISO> }`.
   - Redo sends `{ status: 'active', updatedAt: op.value.updatedAt }`, which
     restores the original. Local redo re-appends `op.value` unchanged, so the
     server then matches local state exactly.
6. **Reap failures are silent.** Use `console.warn`, skip that entity *and
   anything whose delete depends on it* (e.g. don't delete a board if one of
   its nodes failed to delete), keep going, and let the next network start
   retry. No toast, no `networkLoadErrorAtom`.
7. **Local mode is unchanged.** Local undo of an image create still removes
   the entry from the in-memory/persisted document (consistent there: local
   undo of a create removes the node from the array too). The local reaper
   is unchanged.
8. **Deliverable: uncommitted changes in the working tree.** Don't commit,
   push or open a PR.

## Part 1: image undo/redo in network mode

In `src/api/networkOps.ts` `applyImageOp`:

- `replay === 'undo'` with `to === undefined` (undoing an image create): no
  request. The local document still drops the entry (`state/ops.ts`
  `applyImageOp`, untouched).
- `replay === 'redo'` with `from === undefined` (redoing an image create): no
  request. The server row was never deleted, and its server id was already
  reconciled on the original `'do'` POST. Confirm the id resolution still
  works after a redo: the local document re-adds the entry under the op's
  id, so check how `entityReconcile.ts`/`networkIdRemap.ts` treat an image id
  that was already reconciled, and that the re-added local entry ends up
  keyed by the server id. Fix anything that doesn't.
- `'do'` is unchanged (POST + reconcile). The PATCH branch is effectively
  unreachable today (`before` is always `undefined`). Leave it in place.
- Update the doc comment on `applyImageOp` and the replay table in
  `ctx/notes/261008-network-undo-redo.md` (an image create's undo/redo is now
  a no-op on the server; undo/redo of a create now carries `updatedAt`).

Part 1 also includes decision 5 (the `updatedAt` change in `applyReplayedCreate`).

Known race, out of scope: an undo fired while the create's POST is still in
flight (see "Known limitation" in `261008-network-undo-redo.md`). Don't
try to fix it, but don't make it worse.

## Part 2: network reaper

Suggested shape (adapt to the codebase's idioms; keep planning pure and
unit-testable, separate from I/O):

- A pure planner, e.g. `src/state/networkReapPlan.ts`: given the server's
  trashed boards/nodes/edges, the nodes/edges on reaped boards, and `now`,
  return an ordered delete plan. Reuse `reapableBoardIds`/
  `reapableNodeIds`/`reapableEdgeIds` and `REAP_AGE_MS`/`NODE_REAP_AGE_MS`
  from `src/state/reaper.ts`; don't fork the age logic.
- An I/O runner (e.g. in `src/api/`) that fetches candidates with
  `fetchCollection` (Zod-validated, full pagination) and executes the plan
  with `deleteEntity`.

Match the local reaper's semantics:

- Reapable boards: `status === 'trashed'` and `updatedAt` older than
  `REAP_AGE_MS`. Never the root board (`isRoot`). It can't be trashed, but
  guard anyway.
- Everything on a reaped board (`GET /nodes?boardId=…`,
  `GET /edges?boardId=…`) is deleted **regardless of its own status**, as in
  `reapBoards`.
- Reapable nodes and edges: trashed and older than `NODE_REAP_AGE_MS`.
- Defensively, also delete any edge whose `fromNodeId`/`toNodeId` is a node
  being deleted. Deleting a node tombstones its edges at the same instant,
  so they should already qualify, but don't leave a dangling edge if not.
- Board cards (`cardType: 'board'`) pointing at a reaped board are trashed
  at the same instant as that board (`removeEntitiesAtom`), so they normally
  qualify on their own. If an aged, trashed board is referenced by a *live*
  board card (shouldn't happen), skip that board and `console.warn`. Don't
  delete live content.

Candidate queries (json-server v1 filter syntax; see
`ctx/support/260923-json-server-docs.md`): `?status=trashed` per
collection, `?boardId=<id>` for reaped boards' contents. Keep query
construction in the API layer, so a PostgREST adapter can swap it later
(`?status=eq.trashed`).

**Delete order** (each step only for entities whose prerequisites
succeeded):

1. edges
2. nodes
3. boards
4. images: candidates are the `imageId`s of image-card nodes actually
   deleted in step 2. For each, `GET /nodes?imageId=<id>` (or one
   `imageId:in=` query, if it's correct and simpler). Delete the image only if
   no node row of any status still references it. This check is the only
   safety net on json-server, which has no foreign keys, and it covers images shared
   across boards by copy/paste/duplicate.

Don't use json-server's `?_dependent=` or depend on any server-side cascade.
Delete each entity explicitly so behavior is identical on Postgres.
One request per entity is fine (no bulk-delete endpoint in the generic REST
client). Sequential or small bounded concurrency, your choice.

**Integration with the live document** (`src/state/networkBoardLoader.ts`):

- Kick off the reap after the home-board load succeeds. Don't await it in
  `initializeNetworkMode`. Errors never reach the user (decision 6).
- Re-check `accessModeAtom` after every await. If the user switched back
  to local mode, or re-initialized network mode, stop mutating local state
  ("ships in the night"). Consider a generation token if one doesn't
  already exist.
- After the server deletes, remove the successfully reaped ids (boards,
  nodes, edges, images) from `currentBoardAtom` directly, not via history.
  They're aged tombstones, so they can't be in this session's fresh undo
  history.
- Race with the background eager-load and `ensureBoardLoaded`: content
  fetched before a delete can be merged after it (`mergeBoardContent`).
  Make sure reaped ids don't reappear in the local document. Either keep
  a per-session set of reaped ids that `mergeBoardContent`'s caller filters
  against, reset on mode switch and re-init like `loadedBoardIdsAtom`, or
  something equivalent. The TanStack Query cache entries for board content
  may also hold stale data; handle them if they could be re-merged.

Known limitation to document, not solve: multiple clients. Another client
could, in principle, be holding a reaped entity in its undo history. The
24h age makes this unlikely, and there's no restore UI. Clock skew between
clients is ignored, same as local mode.

## Tests and gates

- Vitest unit tests:
  - The planner. Order; board contents reaped regardless of status; root and
    live-board-card guards; edges touching deleted nodes; image candidates
    only from deleted nodes; age boundaries.
  - `networkOps` replay changes. Image create undo/redo issue no request;
    undo/redo of a create carries the right `updatedAt`. Extend
    `src/api/networkOps.test.ts`.
  - The runner, with an injected `fetchImpl`. Failure skips dependents;
    an image still referenced elsewhere isn't deleted.
- Playwright e2e against a real json-server (`e2e/fixtures/jsonServer.ts`
  takes a seed `db`; see `e2e/networkModeCrud.spec.ts` for the pattern):
  - Undo of an image paste leaves the image row on the server; redo doesn't
    create a second image row and the card renders.
  - Seed an aged trashed image card whose image is shared with a live card
    on another board, plus an aged trashed board with content. After network
    init, the expected rows are gone, the shared image survives, and live
    content is untouched.
  - Run e2e via the `playwright-remote-browser` skill and `CLAUDE.local.md`
    (host Playwright server at `ws://host.docker.internal:3322/`, forwarded
    ports 1993–1997). If the host server is unreachable, say so in your final
    report rather than working around it.
- Must pass: `pnpm typecheck`, `pnpm lint`, `pnpm test`, the e2e suite,
  and `fallow audit --format json --quiet --explain --gate-marker agent`
  (verdict not `fail`).

## Deliverables

- Code and test changes, **left uncommitted** in the working tree.
- A new ctx note, `ctx/notes/261009-network-reaper-and-image-lifecycle.md`
  (use the creation date if it isn't 261009). Cover the problem, the
  decisions above, the delete order and why, the accepted image-orphan leak
  and the multi-client limitation as follow-ups, and any judgment calls you
  made.
- Update `ctx/notes/261008-network-undo-redo.md`'s replay table.
- Add a short pointer in `AGENTS.md` alongside the existing network-mode
  paragraphs (one or two sentences linking the new note). No pass counts or
  changelog (see `AGENTS.md`).
- Don't touch any `TODO` comments. Don't add user-facing features beyond the
  above.
- Final report: what changed (files), test/gate results with real output,
  anything skipped and why, and judgment calls.
