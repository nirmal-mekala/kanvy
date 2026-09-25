# Network id reconciliation: removing the id-remap table

## Status of this document

Written after the fact, describing a bug found and fixed in the same
session — not a forward-looking design doc with open questions.

## The bug

Reported: in Network mode, create a board, navigate into it, create a
node inside it, reload — the board persists but the node is gone.

Confirmed against two HAR captures (`ctx/support/`, 2026-09-25): `POST
/boards` never sends an id — json-server always assigns its own
(`SC3Fj2mbP8Y` in the capture, vs. the client's own locally-minted
`iucm4vgmn9am`). The board-card node's `boardRef` field got corrected via
`src/api/networkIdRemap.ts`'s `resolveValueReferences`, but that function
only rewrote `imageId`/`boardRef`/`fromNodeId`/`toNodeId` — never a node
or edge's own `boardId`. A node created *after* navigating into the new
board was sent to `POST /nodes` with the stale local `boardId`, persisted
server-side under an id no real board had, and `GET /nodes?boardId=<real
id>` on reload never found it.

## Why the old design under-covered this

`IdRemapTable` (the old `networkIdRemap.ts`) lived for the whole
network-mode session, in a module-private variable inside
`api/networkOps.ts`. Its own doc comment was explicit about the
consequence: "local app state (`currentBoardAtom`, selection, undo, …)
never learns or cares about the server's id." That was true by design —
and it's exactly why `currentBoardIdAtom`, the route, and every future
FK-shaped field were each a fresh chance to miss a case. `boardId` was
simply never added to the rewrite list.

## The fix

Two things changed together:

1. **The id-remap table is now batch-scoped, not session-scoped.**
   `api/networkOps.ts`'s `applyOpsToNetwork` creates a fresh table per
   call (per gesture), used only to resolve references among ops created
   together in the same batch — e.g. a new board's board-card node, sent
   before the board's own create has resolved. `resolveValueReferences`
   (`api/networkIdRemap.ts`) also now rewrites `boardId`, alongside the
   fields it already covered.

2. **A create's real id is reconciled directly into canonical app state
   the instant it's known** (`state/networkReconcile.ts`'s
   `reconcileNetworkEntityIdAtom`, called from `networkOps.ts` right
   after `recordRemap`) — not debounced, not held in a side table. It
   rewrites the id everywhere it's already load-bearing:

   `networkReconcile.ts` never imports `boardHistoryAtom.ts` or
   `router.tsx` directly — both would close a circular import back
   through `boardHistoryAtom.ts` → `api/boardApi.ts` →
   `api/networkOps.ts` → `networkReconcile.ts` (confirmed by `fallow
   audit`'s circular-dependency check during this fix). Instead,
   `boardHistoryAtom.ts` and `router.tsx` each register themselves into
   `networkReconcile.ts` once, at their own module scope
   (`registerReconcileTargets`/`registerBoardNavigator`), and
   `AttributedOps` (needed for the history rewrite's typing) lives in
   `state/ops.ts` rather than `boardHistoryAtom.ts`, for the same reason.
   - the live board (`currentBoardAtom`) — the entity's own id, plus
     every other entity's field referencing it (`state/
     entityReconcile.ts`'s `reconcileEntityId`)
   - the undo/redo history (`boardHistoryAtom`) — same rewrite applied to
     every stored `Op`, past/present/future (`reconcileHistoryIds`), so
     undo of a since-reconciled create still finds a real entity
     afterward instead of targeting an id `currentBoardAtom` no longer
     has
   - the current-board tracking (`currentBoardIdAtom`) and the route
     itself (`router.navigate({ replace: true })`), when the board
     currently being viewed is the one whose id just got confirmed
   - the live selection, if it contained the old id

   Because reconciliation happens immediately, a *later*, separate
   gesture's ops are always built from already-reconciled state — a node
   created inside a board well after that board's own create resolved
   simply reads the real id off `currentBoardIdAtom`, no table lookup
   needed. This is what actually fixes the reported bug (the node was
   created ~10 seconds after the board, in a separate save batch).

Local mode needed no equivalent change: `generateId()` mints an id once,
synchronously, before anything is written, and `writeBoard` never
reassigns it — there's nothing to reconcile. See the doc comment at the
top of `state/persistence/storage.ts`.

## Known limitation

A just-created entity is rendered by id (`nodeFamily(id)`/`boardFamily(id)`
atom families, keyed by id in list renders). When reconciliation swaps an
id in place, React unmounts the old-id component and mounts a new-id one
for the same visual card — harmless in the common case, but if a user is
actively typing into a just-created, not-yet-confirmed card's text field
at the exact moment its create resolves, that remount could drop focus/
cursor position. Not addressed here — low-probability in practice given
json-server's local latency, and worth revisiting only if it's ever
actually observed.

## Regression coverage

- `src/state/entityReconcile.test.ts` — the pure rewrite functions.
- `src/api/networkIdRemap.test.ts` — `boardId` added to
  `resolveValueReferences`' coverage.
- `src/api/networkOps.test.ts` — batch-scoped resolution (same call),
  and an explicit test that cross-batch resolution *no longer* happens at
  this layer (it's expected to already be resolved via reconciled app
  state by the time a later gesture's ops are built).
- `src/state/atoms/boards.test.ts` — local mode's id is stable across a
  save/reload round trip.
- `e2e/networkModeCrud.spec.ts`'s "id reconciliation regression" describe
  block — the literal reported repro end to end: create board, navigate
  in, create node, verify via a direct REST read that it's stored under
  the real board id.
