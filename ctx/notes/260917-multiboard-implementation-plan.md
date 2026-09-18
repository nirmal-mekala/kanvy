# kanvy — multiboard support: implementation plan

## Status of this document

Implementation plan for `ctx/notes/260917-multiboard-support-design.md` (the
design doc — source of truth for *what* to build; this doc is *how* and in
*what order*). Written before any code changes, per this repo's established
phase-plan convention (see `ctx/notes/260915-prototype-migration-phase5-
implementation-plan.md`). Nothing here should be read as revisiting a design
doc decision — where this plan makes a new call, it's sequencing/file
organization only, and it's flagged as such.

Post-implementation revision (260918): the URL scheme (`/board/:boardId`
below) and the board-title-on-canvas visibility rule (`showCaption`-gated
below) were both changed after this plan was executed — see
`ctx/notes/260918-url-scheme-and-board-title-visibility.md` and the
corresponding update to the design doc's §6/§3. This plan's text below is
left as the historical record of what was actually built at the time,
same convention as the v0.1 spatial-containers revision.

Developer decisions already made for this plan (not re-litigated below):
- This implementation-plan doc precedes code, matching the phase1–7
  convention.
- The tombstone reaper (design doc §5/§7) runs as an **on-load sweep only**
  — no background timer, no "empty trash" UI yet.
- Delivered as **sequential sub-phases with a checkpoint between each** —
  the developer reviews before the next sub-phase starts, same spirit as
  phase5's staged build sequence.

## 1. Two things this plan surfaces before Sub-phase 1 starts

These aren't resolved by the design doc and aren't obviously implied by it
either — flagging per AGENTS.md ("if a change looks like it would alter
behavior beyond the spec, stop and ask") rather than deciding silently.

**Q1 — Import/export scope.** Today `Toolbar.tsx` imports/exports the
single global `Board` wholesale (`boardAtom`/`loadImportedBoardAtom`,
Toolbar.tsx:24-26). Once `boards` is a separate top-level collection with
`boardId`-scoped `nodes`/`edges`, "export" could mean either (a) the whole
app — every board, unchanged shape, still one JSON file — or (b) just the
board currently open. Design doc is silent on this. **This plan assumes
(a), whole-app export/import, unchanged from today's behavior** — it's the
smaller change (the top-level `Board` shape still round-trips as one
document; `boards`/`boardId` just ride along inside it) and doesn't require
inventing a new "export a subtree" feature the design doc never asked for.
Flagging for explicit confirmation before Sub-phase 1 lands, since it's the
kind of decision that's annoying to reverse after export files exist in the
wild.

**Q2 — Selection/focus on navigation.** `selectionAtom`/`focusAtom` are
global, un-scoped by board (state/atoms/selection.ts, focus.ts). Ids are
globally unique (nanoid), so a stale selection from board A simply matches
nothing once filtered to board B's view — functionally inert, not a
correctness bug. But it does mean a phantom selection reappears if the user
navigates back to board A. Design doc doesn't mention this. **This plan
clears `selectionAtom`/`focusAtom` on every board-route change** (Sub-phase
3) as the obviously-correct default — flagging only because it's an
addition beyond what either doc explicitly asked for, not because there's a
real alternative worth picking between.

Proceeding with both defaults unless told otherwise; either can be flipped
cheaply if the answer is "no."

## 2. Sequencing overview

| Sub-phase | Delivers | Checkpoint before next |
|---|---|---|
| 1 | Schema v3 + legacy migration + persistence | Schema/migration tests green, `tsc`/`fallow` clean, board still behaves exactly as today (single implicit root board, invisible to the user) |
| 2 | `boards` collection in state layer; every node/edge query `boardId`-scoped; per-board undo stacks | App still looks/behaves identical to today (no nav UI yet) — this is the highest-risk sub-phase (touches the shared history atom) and gets its own review before any UI work starts |
| 3 | TanStack Router adoption; `/board/:boardId` route; breadcrumb; selection/focus clear-on-navigate | You can hand-edit the URL to `/board/root` and it works; still no way to create a second board from the UI yet |
| 4 | `board` card kind; home-board creation/rename/click-to-navigate; root content-gating (no text/image/link creation on root) | Full create → rename → navigate-in → navigate-out loop works end-to-end on a single board node |
| 5 | Confirm modal primitive; board delete (tombstone) / duplicate / paste; on-load reaper | Multi-board delete/duplicate/paste all gated, undoable, and reaping only ever removes content past its undo window |
| 6 | Tests (unit + e2e) filled in per-sub-phase gaps, `fallow`/coverage pass, `AGENTS.md`/spec docs updated | Feature complete |

Each sub-phase is reviewed before the next starts, per the developer's
sequencing choice. Sub-phases 1–2 deliberately produce **zero visible
behavior change** — they're the risky data-model surgery, isolated from UI
work so a regression is obviously attributable to one or the other.

## 3. Sub-phase 1 — schema v3 + legacy migration + persistence

- `schema/board.ts`: bump `SCHEMA_VERSION` to 3. `BoardSchema` gains
  `boards: z.array(BoardMetaSchema)`. New `BoardMetaSchema` (new file,
  `schema/boardMeta.ts`, mirroring `edge.ts`'s standalone-file pattern):
  `{ id, title, status: z.enum(['active', 'trashed']), createdAt, updatedAt }`.
- `schema/node.ts`: every `NodeBaseSchema` member gains `boardId:
  z.string()`. New `BoardCardSchema` variant: `CardBaseSchema.extend({
  kind: z.literal('board'), boardRef: z.string() }).strict()` — added to
  the `CardNodeSchema` union alongside Text/Image/Link. No node-local
  title field (design doc §2) — display title always resolves through
  `boards`.
- `schema/edge.ts`: `EdgeSchema` gains `boardId: z.string()`.
- `schema/legacy.ts` (`normalizeLegacyBoard`): a v2 (or earlier) document
  has no `boards` array and no per-entity `boardId`. `backfillV0Board`
  (the v1/v2 path) gets a v3 case: synthesize `boards: [{ id: 'root',
  title: 'Home', status: 'active', createdAt: now, updatedAt: now }]` and
  stamp `boardId: 'root'` onto every node/edge that doesn't already have
  one. This makes today's single board become "the root board" for free
  on first load after upgrade — no data loss, no user-visible change.
  Pre-v0 documents (`normalizePreV0Board`) get the same `boardId: 'root'`
  stamp plus the synthesized `boards` array, added at the same point
  timestamps are backfilled.
- `schema/seed.ts` (`createSeedBoard`): add `boards: [{ id: 'root', ... }]`
  and `boardId: 'root'` on the seed card.
- `state/persistence/serialize.ts`: add `boards` to the explicit key list
  (placement: after `edges`, before `images` — doesn't disturb the
  existing "images last" guarantee spec §2.8 relies on).
- Tests (`schema/board.test.ts`, `schema/legacy.test.ts`): fixture helpers
  for `validBoardMeta()`/`validBoardCard()`; positive/negative
  `BoardSchema.safeParse` cases including a `kind: 'board'` node missing
  `boardRef`, a node with `boardId` pointing at a nonexistent board
  (**note:** Zod alone can't enforce referential integrity across
  `nodes[].boardId` → `boards[].id` — that check, if wanted, is a
  hand-written refinement or left as an invariant the state layer
  maintains rather than the schema enforcing; this plan does *not* add a
  Zod-level FK check, since nothing in either doc asks for one and a
  stricter schema than the app itself enforces risks rejecting otherwise-
  valid documents); `normalizeLegacyBoard` cases confirming a v2 fixture
  gains a synthesized root board and universal `boardId: 'root'` stamp.

## 4. Sub-phase 2 — state layer: boardId-scoped queries, per-board undo

This is the sub-phase most likely to surface design gaps, because it's
where "one shared history stack" (spec §8, written for one board) becomes
"one stack per board" (design doc §5) — a real generalization of
`state/history/`, not just a new filter.

- `state/history/reducer.ts`: stays board-shape-agnostic (already generic
  over `T`) — **no change needed here**. What changes is what it's
  instantiated *over*.
- `state/history/boardHistoryAtom.ts`: today, one `HistoryState<Board>`
  for the whole app. New shape: the persisted/autosaved unit is still one
  `Board` document (single localStorage key, per Q1's whole-app-export
  assumption carrying over to storage too — no per-board localStorage
  keys), but undo/redo needs to operate per-board. Plan: keep exactly one
  `HistoryState<Board>` as the autosave/persistence unit (so `storage.ts`
  is untouched), but change what a "step" *means* — `updateBoardAtom`
  gains a required `boardId` argument, and the history entry additionally
  records which `boardId` the mutation was attributed to (design doc §5's
  attribution rule: an action belongs to the board acted *from*).
  `undoBoardAtom`/`redoBoardAtom` become board-scoped: walk `past`/`future`
  filtered to entries whose recorded `boardId` matches the board currently
  being viewed, splicing just that entry out/in rather than always
  popping the literal last global entry. This keeps one flat `past`/
  `future` array (simple, one autosave unit) while giving each board its
  own effective undo timeline — cheaper than N independent `HistoryState`
  instances (which would need their own coalescing/depth bookkeeping
  each) and avoids a second data structure to keep in sync with the
  single persisted `Board`.
  - `MAX_HISTORY` (100, spec §8) applies per-board — i.e., counted over
    that board's own filtered entries, not the flat array's total length.
  - Coalescing (400ms window) stays keyed off wall-clock time only, same
    as today — two rapid edits on *different* boards already won't
    coalesce once each entry carries a `boardId`, since coalescing only
    makes sense within one board's own gesture stream. Confirm this in
    the reducer's now-`boardId`-aware `pushUpdate` call site rather than
    the pure reducer itself.
- `state/atoms/nodes.ts` / `edges.ts`: every read atom
  (`nodeIdsAtom`, `nodeFamily`, `edgeIdsAtom`, `edgeFamily`) and every
  board-filtering call site needs a `currentBoardId` — sourced from the
  route (Sub-phase 3) but stubbed as a plain atom (`currentBoardIdAtom`,
  defaulting to `'root'`) in this sub-phase so Sub-phase 2 doesn't depend
  on Sub-phase 3's router work landing first. `nodeIdsAtom` becomes `get(
  boardAtom).nodes.filter(n => n.boardId === get(currentBoardIdAtom) &&
  isBoardVisible(n.boardId)).map(...)` — `isBoardVisible` excludes a
  `status: 'trashed'` board's content (design doc §2's cascade-for-free).
  Every mutation atom that appends a node (`addNodeAtom`, `addNodesAtom`,
  card-creation call sites) must stamp the new node/edge's `boardId` from
  `currentBoardIdAtom` — nothing here assumes the caller does it, since a
  missed stamp is a silent, hard-to-notice bug (the node would just
  belong to `undefined`/wrong board).
- New `state/atoms/boards.ts`: `boardsAtom` (derived from `boardAtom`,
  read), `addBoardAtom`, `renameBoardAtom` (writes `boards[id].title`,
  used by both on-canvas and breadcrumb rename per design doc §3/§6),
  `setBoardStatusAtom` (tombstone flip, used by delete/undo/redo — see
  Sub-phase 5).
- `containers/`, `clipboard/`, `geometry/`: **no changes** — these already
  operate on whatever `nodes`/`containers` array they're handed; they stay
  ignorant of `boardId` as long as call sites hand them an
  already-current-board-filtered list (per the fork research: container
  nesting depth is already unlimited and needs no changes — design doc
  §7's open question on this is resolved as "already works," confirmed via
  `containers/renderOrder.ts`'s depth-first traversal and `containment.ts`'s
  flat-pass `computeCarryIds`).
- Tests: `state/history/reducer.test.ts` gains per-`boardId` attribution
  cases; a new test file for the board-scoped undo/redo wrapper logic in
  `boardHistoryAtom.ts` (currently untested directly — it's thin Jotai
  wiring today, but board-scoping adds real logic worth covering).

## 5. Sub-phase 3 — TanStack Router adoption

- Add `@tanstack/react-router` (new dependency — confirmed absent from
  `package.json` today).
- Route tree: single pattern `/board/:boardId`, root path `/` redirects to
  `/board/root` (design doc §6). Loader reads `currentBoardIdAtom`'s
  source of truth from the URL param and confirms the board exists
  (falls back to `root` if the param names an unknown or trashed board —
  new, small edge case neither doc calls out: navigating a stale/bad-
  memory URL shouldn't hard-crash the router).
- `App.tsx` restructures around a router `<RouterProvider>`; `Canvas`
  renders per-route, reading `currentBoardIdAtom` (now driven by the
  route, replacing Sub-phase 2's stubbed default).
- New `components/breadcrumb/Breadcrumb.tsx`: home icon (→ `/board/root`)
  + chevron + current board's title (editable inline exactly like
  design doc §6 — writes to `boards[boardId].title` via
  `renameBoardAtom`, same action the on-canvas rename uses). Disabled/
  hidden when `boardId === 'root'` (root's title is fixed, design doc
  §2/§7). Slotted between `Toolbar` and `Canvas` in `App.tsx` — Toolbar
  itself is unchanged (per fork research, it has no existing layout slot
  for this and doesn't need one; a separate row below it is simplest).
- Selection/focus clear-on-navigate (Q2 above): a route-change effect
  resets `selectionAtom`/`focusAtom` to empty.
- Tests: e2e coverage for direct URL navigation to `/board/root` and a
  nonexistent board id; breadcrumb rename parity test (same commit
  behavior as on-canvas rename).

## 6. Sub-phase 4 — home-board UI: `board` card kind

- `cards/newCard.ts`: new `newBoardCard` factory, mirroring
  `newTextCard`/`newImageCard`/`newLinkCard` — fixed `CARD_WIDTH`, no
  heading size ever (design doc §2).
- `components/canvas/useCardCreation.ts`: `handleCanvasDoubleClick`
  (currently unconditional `addNode(newTextCard(...))`, per fork
  research) branches on `currentBoardId === 'root'`: mints a fresh
  `boards` entry (`addBoardAtom`) *and* a board-node referencing it
  (`newBoardCard`), in one history step attributed to root. On any
  non-root board, behavior is completely unchanged (still `newTextCard`).
  Root additionally disables: image-drop-creates-card (`handleCanvasDrop`)
  and any create-card path from OS-clipboard paste — root only ever
  creates `board`/`container` nodes (design doc §3), never text/image/
  link.
- `CardBody.tsx`: new `node.kind === 'board'` branch, modeled directly on
  the existing `kind === 'link'` branch (fork research: that's exactly
  where kind-specific interior content lives) — but a plain interior
  `<div>` (not an `<a>`), `onClick` navigates via the router
  (`navigate({ to: '/board/$boardId', params: { boardId: node.boardRef
  } })`) instead of `target="_blank"`. Border/handle click still selects
  via `Card.tsx`'s existing `onPointerDown` on the outer shell — unchanged,
  since that's the mechanism design doc §3 says to reuse as-is.
- Rename: reuse the existing `showCaption`-visibility rule (`Card.tsx`'s
  `showCaption` computation) for the title-edit field, but for `kind:
  'board'` it commits to `renameBoardAtom(node.boardRef, value)` instead
  of `updateCardContentAtom` — board nodes have no `content` field
  meaningfully used for display (design doc §2: no node-local title).
- Multiselect, edges between board nodes, color/task/recency/view modes:
  no code changes — design doc §3 confirms these fall out for free since
  `board` is a full `CardNode`.
- Tests: `cards/newCard.test.ts` gains `newBoardCard` case;
  `convertCardKind.test.ts` confirms `board` is excluded from kind-
  conversion (never converts to/from text/image/link — design doc doesn't
  ask for this and it isn't implied by "full CardNode," so this plan
  explicitly keeps `kind: 'board'` out of `convertCardKind`'s conversion
  matrix); e2e: create board node on root, rename via both affordances,
  click-navigate in, breadcrumb-navigate out.

## 7. Sub-phase 5 — confirm modal, tombstone delete/duplicate/paste, reaper

- New `components/confirm-modal/ConfirmModal.tsx`: generic primitive
  (design doc §4/§7 — no existing modal component in this codebase to
  extend). Props: title/body copy, confirm/cancel labels, `onConfirm`.
  Renders as a blocking overlay (matches "hard gate, not act-then-toast,"
  design doc §4). This is the only new UI primitive in the whole feature.
- Gating logic lives in `useClipboardShortcuts.ts` / delete keyboard
  handler / duplicate handler: before dispatching a board-node delete,
  duplicate, or paste, check `kind === 'board' && boardId === 'root'`
  across the affected selection; if any match, compute the *hidden* cost
  (walk every descendant board reachable — recursively, since a
  duplicated/pasted board's own content could itself contain board nodes
  if nesting existed, though design doc explicitly forbids board-in-board
  nesting, so this is just "count nodes/edges whose `boardId` is in the
  set of directly-referenced boards," no recursion needed) and show
  `ConfirmModal` before proceeding. Fires once per action regardless of
  selection size (design doc §4).
- Board delete: `setBoardStatusAtom(boardId, 'trashed')` — **not** a
  removal. Node/edge `boardId` values are untouched (design doc §2);
  `isBoardVisible` (Sub-phase 2) already excludes trashed boards'
  content from every render/query path for free.
- Board duplicate/paste: new function (not an extension of
  `clipboard/duplicateNodes.ts` — per fork research, that module and
  `nodeClipboard.ts` are kind-agnostic single-node copiers that
  explicitly don't cascade to other nodes, and existing node-clipboard
  paste explicitly drops inter-node edges, which is wrong for this case).
  New `clipboard/duplicateBoardNodes.ts`: for each selected board node,
  mint a fresh `boards` entry, then deep-copy every node/edge whose
  `boardId` matches the source board (fresh ids, remapped `boardId`,
  remapped `fromNodeId`/`toNodeId` for edges within that set), plus the
  new board-node itself on root. One history step, attributed to root
  (design doc §5's cross-board attribution rule).
- Undo/redo O(1) for these three actions (design doc §5): delete's undo
  flips `status` back; duplicate/paste's undo tombstones the newly-minted
  board(s) (never actually discards the copy — same tombstone mechanism,
  so a redo after undo doesn't need to reconstruct anything).
- Reaper (on-load sweep, per developer decision): on app boot, after
  `loadBoard()`, scan `boards` for `status: 'trashed'` entries whose
  delete/duplicate-undo action has aged out of that board's own undo
  window (i.e., no entry attributed to that board's own delete action
  remains reachable in `past`/`future` — Sub-phase 2's per-board-filtered
  history makes this check straightforward: if a board has zero history
  entries at all pointing at it post-tombstone, or the tombstoning entry
  itself has fallen off the 100-step window, it's reapable). Reaping
  actually removes the board's `boards` entry plus every node/edge/image
  with that `boardId`. Runs once per load, before the first render commits
  autosave (so a reap is itself persisted on next save, not immediately
  forced).
- Tests: unit tests for the reaper's "has this board's tombstone aged out"
  predicate (pure, easily testable against constructed history fixtures);
  e2e for the full confirm → delete → undo → redo cycle and duplicate/
  paste-of-a-contained-board (design doc §7's "board inside a duplicated
  container" case — falls out automatically per the design doc, verified
  here as an e2e case rather than assumed).

## 8. Sub-phase 6 — closure

- Fill any coverage gaps `fallow health --coverage-gaps` surfaces across
  the five sub-phases above.
- Full `fallow audit`/`tsc --noEmit`/`biome check`/`vitest run`/`playwright
  test` pass.
- Update `AGENTS.md`'s "where this repo is right now" section: multiboard
  support moves from "designed, not implemented" to implemented, schema
  version bump noted (v2 → v3) alongside the existing v0.1 note.
- Update `ctx/notes/260915-kanvy-spec.md` §14's multiboard line to point
  at "implemented" rather than "deferred to prototype-migration phase 2"
  — a documentation update only, not a design change.

## 9. Non-goals (carried from the design doc, not re-litigated)

Board-in-board nesting, any home-board card kind beyond `board`/
`container`, a real network/multi-user backend, collaboration/sharing —
all explicitly out of scope per design doc §1, unchanged here.

## 10. Next step

Developer review of this plan (particularly §1's two flagged questions and
§4/§5's history-atom redesign, the riskiest single piece) before Sub-phase
1 starts.
