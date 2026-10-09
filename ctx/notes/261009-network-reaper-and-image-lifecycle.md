# Network mode: images survive undo, and a server-side reaper

Implements `ctx/prompt/261009-network-image-lifecycle-and-reap.md`. No
schema change.

## The problem

The developer is adding a Postgres + PostgREST backend next to json-server.
In that schema, `nodes.board_id → boards ON DELETE CASCADE` and
`nodes.image_id → images ON DELETE RESTRICT` (the developer owns the DDL;
nothing here writes SQL). The network client broke both in two ways:

- **Undo of an image paste deleted the image.** An image op is placed
  before its node's create op, and undo replays a batch in reverse. So
  undoing a paste first trashed the node (`PATCH {status:'trashed'}`, so
  the row stays and still references the image), then sent
  `DELETE /images/:id`. Under `RESTRICT` that DELETE fails. Under
  `CASCADE` it would hard-delete the trashed node, and redo (a status
  PATCH) would then 404.
- **Network mode never hard-deleted anything.** `reapEntities` ran only for
  local mode. Trashed nodes, edges and boards stayed on the server forever.

Images are never deduplicated by content, but in-app copy/paste, duplicate
and board duplication copy `imageId` as-is. So `nodes.image_id → images.id`
is many-to-one, possibly across boards. Whether an image is orphaned can
only be answered by asking the server, not by the client's partially
loaded document.

## Decisions (made with the developer)

1. Undoing an image create doesn't delete the image on the server. It
   stays until its last referencing node is reaped (the deferred sweep
   local mode already uses, `260921-action-based-undo-and-tombstoning.md`
   Q3).
2. A network-mode reaper hard-deletes aged trashed entities on the server,
   ordered so foreign keys never reject a delete.
3. Orphan discovery is limited to nodes reaped in the current pass: no full
   `GET /images` scan (json-server can't select fields, so that would
   download every data URI). See "Follow-ups" for the leak this accepts.
4. The reaper runs fire-and-forget in the background after
   `initializeNetworkMode`'s home-board load succeeds. It queries the
   server for candidates and doesn't rely on the eagerly loaded document.
5. Undoing a create sends `{status:'trashed', updatedAt:<now>}`, and redo
   sends `{status:'active', updatedAt:op.value.updatedAt}`. Before this,
   the tombstone kept the creation-time `updatedAt`, and the reap age is
   measured from `updatedAt`.
6. Reap failures are silent: a `console.warn`, then skip that entity and
   anything that depends on it, and carry on. The next network start
   retries. No toast and no `networkLoadErrorAtom`.
7. Local mode is unchanged (local undo still drops the image entry, and
   the local reaper is untouched).

## Part 1: image undo/redo (`api/networkOps.ts`)

`applyImageOp` returns without a request when replaying (undo or redo) an
op whose `before` is `undefined`, i.e. an image create. `'do'` still POSTs
and reconciles. The PATCH/DELETE branches are unchanged; they're
unreachable today. The replay table is in `261008-network-undo-redo.md`.

**Redo's id resolution needed no fix.** The original POST reconciles the
server id into `currentBoardAtom` and into every history entry
(`reconcileHistoryIds` rewrites an `ImageOp.id` and the node create's
`value.imageId`). So a local redo re-adds the entry under the server id,
and the node points at it. Covered by an `entityReconcile.test.ts` case and
the e2e test. The known undo-while-POST-in-flight race
(`261008-network-undo-redo.md`) is unchanged. It's no worse than before:
undo of an image create now sends nothing at all, so it can't 404.

## Part 2: the reaper

- `state/networkReapPlan.ts` is pure planning. It reuses
  `reapableBoardIds`/`reapableNodeIds`/`reapableEdgeIds` (and so
  `REAP_AGE_MS`/`NODE_REAP_AGE_MS`) from `state/reaper.ts`.
- `api/networkReaper.ts` (`runNetworkReap`) does the I/O: it fetches
  candidates with `fetchCollection` (Zod-validated, fully paginated) and
  deletes one entity per request with `deleteEntity`, sequentially.
- `state/networkBoardLoader.ts` (`reapInBackground`) wires it into the live
  document.

### Candidates (json-server v1 filter syntax, all in `api/networkReaper.ts`)

1. `?status=trashed` on `boards`, `nodes` and `edges`.
2. For aged, trashed, non-root boards: `nodes?boardId:in=…`,
   `edges?boardId:in=…` (content of any status), and `nodes?boardRef:in=…`
   (board cards pointing at them).
3. `edges?fromNodeId:in=…` and `edges?toNodeId:in=…` for every node that
   could be deleted.
4. After nodes are deleted: `nodes?imageId:in=…` for their images.

`:in` lists are chunked at 50 ids to keep URLs short. A PostgREST adapter
would swap this module's query construction (`status=eq.trashed`,
`board_id=in.(…)`).

### Delete order, and why

Each step only covers entities whose prerequisites were deleted:

1. **Edges.** Nothing references an edge. Edges reference nodes and a
   board.
2. **Nodes**, once every edge touching them is deleted. Nodes reference
   a board, a `boardRef` board, and an image.
3. **Boards**, once every node and edge on them, and every board card
   pointing at them, is deleted.
4. **Images**, taken only from the image cards actually deleted in step
   2, and deleted only if `GET /nodes?imageId:in=…` finds no node row of
   any status still referencing them. On json-server, which has no
   foreign keys, this check is the only thing protecting an image shared
   with a card on another board.

Nothing uses json-server's `?_dependent=` or any server-side cascade, so
behavior is identical on Postgres.

### Semantics (matching the local reaper)

- Boards: `trashed` and older than `REAP_AGE_MS`. Never `isRoot`
  (guarded even though the root can't be trashed).
- Everything on a reaped board goes, regardless of its own status.
- Nodes/edges: `trashed` and older than `NODE_REAP_AGE_MS`.
- Defensively, any edge touching a deleted node is deleted too, even if
  it isn't aged/trashed itself, so no edge is left dangling.

### Integration with the live document

- `networkSessionAtom` is a generation counter, bumped by
  `initializeNetworkMode` and `switchToLocalMode`. The reaper checks
  `accessModeAtom === 'network'` and the session after every await. Once
  the session is stale, it stops sending requests and leaves local state
  alone.
- After the deletes, reaped ids are removed from `currentBoardAtom`
  directly, not through history. Aged tombstones can't be in this
  session's fresh undo stack.
- Race with the eager-load and `ensureBoardLoaded`: `reapedIdsAtom` is a
  per-session set of reaped ids, kept per kind because server ids are
  only unique per collection. It's reset with `loadedBoardIdsAtom`, and
  `ensureBoardLoaded` filters fetched content against it before
  `mergeBoardContent`. A reaped board's TanStack Query content entry is
  also removed. The client uses the default `staleTime: 0`, so
  `fetchQuery` never serves those entries from cache except to dedupe an
  in-flight fetch. The merge filter covers that case.

## Judgment calls

- **Skipping a board still referenced by a board card that isn't being
  deleted.** The prompt asks to skip (and warn) when a *live* card points
  at an aged, trashed board. I also skip when the card is trashed but not
  reapable, or sits on a board that was itself skipped. Deleting the board
  would leave a dangling `boardRef` either way (or be rejected by a
  plausible FK). Skips cascade: keeping a board keeps the cards on it,
  which can keep the boards they point at. The planner repeats until
  nothing new is skipped.
- **Candidate nodes include everything on candidate boards** when fetching
  touching edges (step 3), even if a board is later skipped. This
  over-fetches a little but means planning needs only one round of edge
  queries. The plan itself only deletes edges touching nodes it actually
  deletes.
- **Image reference check uses one `imageId:in=` query** (chunked) instead
  of one query per image. It returns live and trashed nodes alike, because
  there's no status filter.
- **A failed candidate fetch aborts the whole pass** (warned, nothing
  deleted yet). A failed image-reference check skips only the image step.
- **Stopping mid-pass** (mode switch or re-init) still leaves the server
  consistent, since each step only runs after its prerequisites
  succeeded. The rest is picked up on the next network start.
- **Sequential deletes, no concurrency.** This is simplest, and it's a
  background task.
- **e2e tests live in `networkModeCrud.spec.ts`**, reusing its serialized
  json-server port (1997), so no new host-forwarded port or env var was
  needed.

## Follow-ups / known limitations (not built)

- **Accepted image-orphan leak.** Images orphaned by anything other than a
  reap stay on the server forever. Examples: converting an image card to
  text, or undoing an image-paste-onto-existing-card (that undo PATCHes
  the node back to text, leaving nothing that references the image). A
  Postgres-side job could sweep `images` with no referencing `nodes` row.
- **Multiple clients.** Another client could still hold a reaped entity in
  its undo history and later PATCH it (a 404 save-failure toast there).
  The 24h age makes this unlikely, and there's no restore UI. Clock skew
  between clients is ignored, same as local mode.
- **Check-then-delete window for images.** A node that starts referencing
  an image between the reference check and the DELETE (e.g. a copy/paste
  of a card in that instant from another client) would be left dangling
  on json-server. `RESTRICT` rejects that DELETE on Postgres, which the
  reaper warns about and retries next start.
- `NODE_REAP_AGE_MS` still equals `REAP_AGE_MS` (the existing flag in
  `state/reaper.ts`).
