# Action-based undo/redo + tombstoning + per-entity mutations: design notes

## Status of this document

Design notes + a rough sequencing sketch from a conversation between the
developer and an agent — not a formal questionnaire, not an implementation
plan in the phase1–7 sense. **Nothing described here is built.** The
current undo stack is still the whole-`Board`-snapshot model
(`src/state/history/reducer.ts` / `boardHistoryAtom.ts`), and delete is
still a hard removal for nodes/edges (`removeEntitiesAtom` in
`src/state/atoms/nodes.ts`) while only boards use a tombstone
(`src/state/reaper.ts`). Per AGENTS.md, this doc surfaces the shape of the
change and its open questions rather than deciding them — it's
investigation/design output, not permission to implement.

Context, corrected as of 260922: there is no TanStack Query integration
and no `src/api/` layer today — that doesn't exist yet anywhere in the
codebase. Persistence is 100% synchronous `localStorage` via
`src/state/persistence/storage.ts` (a hand-rolled debounced saver), so
there's no network boundary yet to be coarse or fine-grained. TanStack
*Router* is installed and load-bearing (`src/router.tsx`, wired as the
app's root in `src/App.tsx`) but it's purely a navigation layer for
multiboard — unrelated to persistence, and not something this doc follows
from.

This doc's actual scope is therefore broader than "move an existing
integration to per-entity granularity": it's (1) the action-based undo
stack and tombstoning work described below, done against the current
whole-snapshot/localStorage setup, and (2) introducing TanStack Query
itself as the mutation layer once the ops model exists to map onto it,
including dev-only env vars that inject simulated latency and error rate
into every query *and* mutation (not just writes) for testing against a
flaky backend before a real one exists. Both are still unbuilt.

## 1. Why whole-snapshot is limiting

- A failed network save can't be attributed to "this one edit" — recovery
  is necessarily coarse (today: non-destructive toast + retry on the whole
  board, not a real per-op rollback — see `useBoardPersistence.ts`).
- Undo entries are conceptually whole-document even though most gestures
  touch one entity or a small handful (this is partly mitigated today by
  reference-sharing — untouched entities keep the same object reference,
  which is what `nodeFamily`'s derived-atom equality check in `nodes.ts`
  already relies on — but the *undo stack itself* still stores/compares
  whole `Board` objects).
- A real REST backend wants a natural mapping to per-entity
  `POST`/`PATCH`/`DELETE`, which whole-document snapshots don't give you.

## 2. Two changes, best done together

### 2a. Action-based (diff) undo/redo stack

`HistoryEntry<T>` (`reducer.ts`) currently wraps `{ state: Board }`. It'd
need to become something like `{ ops: Op[], boardId, restoreSelection? }`,
and `pushUpdate`'s "compare-by-reference, swap `present`" logic becomes
"append to / merge into the current entry's ops."

**Getting the ops — two strategies:**
- *Hand-authored at each call site*: rewrite every mutation atom in
  `nodes.ts`/`edges.ts`/`boards.ts` (~15 of them) to explicitly construct
  op objects instead of `board.nodes.map(...)`. **DEVELOPER MARKING THIS AS
  PREFERRED**
- ~~*Auto-diff the existing whole-board updater's output* (recommended):
  keep every atom's current shape (`updater: (board) => Board`), and diff
  `prevBoard` vs `nextBoard` by walking `nodes`/`edges`/`boards`/`images`
  by id + **object identity** wherever the diff runs (today that'd be
  inside `updateBoardAtom`). This is cheap and correct specifically
  because the codebase already guarantees untouched entities keep their
  reference — a changed reference *is* "this entity was touched," for
  free. A ref in new-but-not-old is a create, old-but-not-new is a delete,
  changed-in-both is an update (shallow-diff its own fields for
  `updatedValues`, treating nested shapes like `task`/`link` as opaque
  replace-whole-subobject leaves rather than deep-diffing them).~~

**Grouping** (one entry, multiple ops — group-drag, container-carry,
delete's cascades) mostly falls out for free either way, since most
gestures already go through one `updateBoardAtom` call with a batch shape:
`moveNodesAtom(moves: {id,x,y}[])` already covers multi-node drag,
`removeEntitiesAtom` already produces a cascade (node removal + edge
removal + image pruning + board tombstoning) in one call today.

**Coalescing gets harder**, not free: today, N mousemove-driven updates
within the 400ms window (`COALESCE_MS`) just keep replacing `present.state`
wholesale. With ops, coalescing has to *merge into an existing op*
(overwrite node X's `after` rather than appending a second op for it) —
real new logic, not just "push more items onto a list."

**The one structural wrinkle ops don't solve on their own:** node/edge
z-order isn't a stored field — array position *is* z-order (see
`containers/renderOrder.ts` and the schema's array-order convention). A
plain per-entity diff has nothing to say about a pure reorder
(`reorderNodesAtom`), since no entity's own fields change. Two options:
give reorder its own op type (`{action: 'reorder', entity: 'node', order:
id[]}`, applied as a whole-array-position op, schema unchanged), or add an
explicit `zIndex` field so reordering becomes ordinary per-node update
ops. The former is the smaller change and doesn't touch the schema —
recommended, but flagged as a real decision (Q4 below).

### 2b. Tombstoning nodes/containers/edges/images

This is what resolves delete's remaining asymmetry. A hard delete needs
`before: fullEntityValue, after: nothing` — a different shape from every
other op, and (per §2a) it also loses the entity's array position, i.e.
its z-order, unless that's captured separately. **Tombstoning collapses
delete into an ordinary update op** (`status: 'trashed'`, same shape as any
other field patch) and preserves z-order for free, since the entity never
actually leaves the array. This is a direct generalization of what boards
already do (`schema/boardMeta.ts`'s `status`, `state/reaper.ts`) — see
§7 there for exactly why "trashed" instead of "gone."

**Scope:** extend `status: 'trashed'` (or equivalent) to nodes, cascade it
to edges touching a tombstoned node (mirrors today's cascade-delete in
`removeEntitiesAtom` — recommend keeping the cascade, so "is this edge
live" stays a self-contained check rather than needing to inspect both
endpoints every render), and reconsider image lifecycle (§ below).

**Blast radius — every "live entity" reader needs a status filter.**
Boards get away with a narrow blast radius today (a handful of
board-management atoms + UI surfaces read `board.boards`). Nodes/edges are
read *everywhere*. Concrete call sites that would need updating:
- `nodeIdsAtom` / `nodeFamily` (`state/atoms/nodes.ts`),
  `edgeIdsAtom` / `edgeFamily` / `findEdgeBetween` (`state/atoms/edges.ts`)
- Containment/geometry: `containers/containment.ts`, `geometry/
  containment.ts`, `geometry/noFlyZone.ts`, `geometry/snap.ts` — a
  tombstoned container must stop participating in drag-carry/no-fly-zone
  checks even though it's still array-resident
- Rendering: `Card.tsx`, `Container.tsx`, `EdgeLayer.tsx`,
  `containers/renderOrder.ts`
- Clipboard/duplicate: `clipboard/duplicateNodes.ts`,
  `clipboard/duplicateBoardNodes.ts`, `clipboard/nodeClipboard.ts`
- `state/persistence/serialize.ts` / `import.ts` (does export include
  trashed content? — see Q5)

-> note: in a few different places, we have noted "needs to be added to every
site". look for ways to organize code so that this pattern is harder to screw
up. encapsulate logic where possible

**Reap-window becomes a higher-stakes knob.** Board deletion is rare;
node/card deletion happens constantly during normal use. A
tombstone-everything model means the trashed set — and the saved
localStorage payload, since nothing's purged until reaped — grows much
faster than it does for boards today. `reaper.ts`'s `REAP_AGE_MS` (24h) is
tuned for board-delete frequency; nodes/edges would very likely need their
own, shorter window (Q6).

-> dev note: im okay with keeping this around for now as is.

**Images are a different kind of thing.** They're not a user-facing
entity with a visible lifecycle — they're blobs, reference-counted and
eagerly pruned today (`pruneOrphanedImages`, called defensively from
`addNodeAtom`/`replaceNodeAtom`/`removeEntitiesAtom`). Tombstoning nodes
naturally suggests *deferring* image pruning to the same reaper sweep
instead of eager per-mutation pruning — one unified sweep instead of
several scattered eager call sites — but that's a real tradeoff, not a
free simplification: an unreferenced image blob then sits in the saved
payload longer, which matters for localStorage quota (Q3).

**Invariant that must carry over exactly:** the board reaper's permanent
purge runs once, at load, *outside* the undo stack — applied directly to
`initialBoard` in `boardHistoryAtom.ts`, never through `updateBoardAtom`.
`reaper.ts`'s own comment on `reapableBoardIds` explains why the "wait for
the undo window to close" framing doesn't actually apply: undo history is
in-memory-only and never persisted, so at load time the in-session undo
window is *always* empty — reaping has to be a real wall-clock delay from
the tombstone's `updatedAt`, independent of undo/redo entirely, or an
accidental delete could be permanently purged on the very next reload.
Generalizing to nodes/edges/images must preserve this — reaping stays a
non-undoable, load-time-only sweep, just with (likely) its own age
threshold.

**This also resolves the node/board delete semantic mismatch.** Today,
node/edge delete is hard (spliced out, gone) while board delete is soft
(tombstoned, reaped later) — two different behaviors for "delete" doing
double duty in one user gesture when you remove a board-card (the card
node is hard-deleted; the board it references is soft-deleted). Tombstoning
nodes aligns the two: "delete" becomes soft everywhere, and the
one-gesture-two-effects case collapses into "two update ops in one entry"
instead of "a delete op plus an update op."

## 3. Consequences for a future TanStack Query / mutation mapping

Unlike §1-2, none of this has a partial implementation to correct against
— there's no `src/api/` layer, no `QueryClient`, no `useMutation` anywhere
in the codebase today (confirmed 260922). This section describes the
shape a TanStack Query layer *would* take once it's introduced on top of
the ops model, plus the dev-tooling that should ship with it. TanStack
*Router* is already installed but is unrelated (navigation only).

- Once delete is tombstone-as-update, the eventual network mapping
  simplifies: node delete becomes a `PATCH`-shaped op (`{status:
  'trashed'}`), the same call shape as any other field update — not a
  `DELETE` that needs the full prior payload preserved for undo. This
  resolves the earlier complication (flagged in conversation, not written
  up before now) that undoing a real `DELETE` would otherwise require
  re-`POST`ing the entity with its original id.
- The only thing that would ever need a real `DELETE` call is the
  reaper's permanent purge — which, per the invariant above, happens
  outside the undo stack and isn't user-facing/optimistic, so it doesn't
  need rollback semantics the way in-session mutations do.
- Still recommend batching network mutations at the **history-entry
  (gesture)** level, not per-op — a group-drag of 3 nodes should still be
  one network call, both to avoid a mutation storm on a fast drag and to
  match "one gesture = one undo step = one save." Whatever plays the role
  `boardApi.ts` would have played can keep applying the whole ops batch
  to its own document copy under localStorage; only its internals change
  when a real per-entity backend eventually lands.
- Update/tombstone ops ("set field to X") are naturally idempotent under
  retry. True creates already are, since ids are client-generated
  (`nanoid`, `schema/legacy.ts`'s `generateId`) — retrying a `POST` with
  the same id doesn't produce a duplicate against any backend that treats
  id as the primary key.
- **Dev tooling:** once mutations are wired through TanStack Query, add
  dev-only env vars for a simulated network delay (ms) and error rate
  (%), applied uniformly to every query *and* mutation — not mutations
  only — so read-path loading/error states get exercised too, ahead of a
  real backend existing to be slow or flaky against.

## 4. Open questions (flagging, not deciding)

- **Q1 — schema version bump.** Adding `status`/tombstone-timestamp to
  `Node`/`Edge` (and maybe image entries) is a schema change requiring a
  version bump + migration in `schema/legacy.ts`, same pattern as past
  revisions (see `260916-v0.1-spatial-containers.md`).

-> sounds good

- **Q2 — container cascade.** Does tombstoning a container cascade to its
  spatially-contained nodes, or does it leave them exactly as today's hard
  delete does (no cascade — they just stop being "contained" once the
  container's gone, since containment is purely derived/spatial, v0.1)?
  Leaning toward matching today's no-cascade behavior for consistency, but
  this is a real decision, not an obvious default.

-> no cascade. user needs to explicity multi-select container + children to
delete all, if only the container is selected and deleted, no cascae, just
tombstone one node

- **Q3 — image lifecycle.** Eager prune (current, smaller storage
  footprint between saves) vs. deferred reaper sweep (tombstone-consistent,
  larger footprint until reaped). Needs a real answer, not just "whichever
  is more consistent."

-> deferred reaper sweep is OK w me

- **Q4 — reorder representation.** Own op type for `reorderNodesAtom`
  (recommended, no schema change) vs. an explicit `zIndex` field (bigger
  change, but makes reorder an ordinary per-entity update). See §2a.

-> good call out - i actually do think that we want an explict "index" field.
the app can just order by index on read and then keep existing logic that uses
array order as source of truth, but we expect a wide variety of backends to
support this (JSON + json-server, but also potentially SQLite and PG
implementations, for which we would want something explicit)

- **Q5 — export/import scope for trashed content.** Presumably trashed
  entities travel with JSON export/import until reaped, same as boards
  today — but this wasn't asked explicitly when boards got tombstoned
  either (see the multiboard implementation plan's own Q1 on export
  scope), so it's worth confirming rather than assuming.

-> yeah keep it all around for now
  
- **Q6 — reap-window tuning for nodes/edges/images.** Very likely needs a
  shorter `REAP_AGE_MS`-equivalent than boards' 24h, given how much more
  often individual cards are deleted than whole boards — and eventually
  probably wants a real "trash" UI rather than a silent timed sweep, though
  that's out of scope for this doc.

-> can keep for now. you're right that this will likely be revisited

## 5. Rough sequencing (not a committed plan)

A possible starting point, not a strict order — front-loading
tombstoning since it's what makes delete regular *before* the diff model
has to represent it, and because it's independently useful/shippable on
its own if the team wants to stop and reassess before touching the undo
stack. Whoever picks this up should reshuffle freely based on whatever's
already landed on the branch by then (per §1a/2a, hand-authored ops at
each call site is the preferred strategy, not auto-diff, which changes
what step 4 actually involves):

1. Schema: add status (+ tombstone timestamp) to `Node`/`Edge` (and
   `images` entries, pending Q3); version bump + migration.
2. Rewire `removeEntitiesAtom` + its edge cascade to tombstone instead of
   splice; audit and update every "live entity" reader enumerated in §2b
   as one focused pass (this is the largest, most mechanical step —
   deliberately not interleaved with the ops-model work below).
3. Extend `reaper.ts`'s sweep to nodes/edges/(images), with its own
   tuned age threshold (Q6).
4. Add the explicit `index` field (Q4) and rewrite each mutation atom in
   `nodes.ts`/`edges.ts`/`boards.ts` to construct ops directly at the call
   site instead of returning a whole updated `Board`; change
   `HistoryEntry` to the ops shape; rewrite `pushUpdate`'s coalescing to
   merge ops instead of swapping `present` wholesale.
5. Introduce TanStack Query as the mutation layer: a `src/api/`-equivalent
   that takes an ops batch and applies it to a document copy under
   localStorage for now (no real backend yet), batched at the
   debounce/history-entry granularity, not per-op. Wire in the dev-only
   delay/error-rate env vars (§3) at the same time, since they only make
   sense once queries/mutations exist to inject them into.
6. Only once a real backend exists: split the single save call into
   per-entity `POST`/`PATCH`/`DELETE`, fed by the same ops, per entity
   kind.
