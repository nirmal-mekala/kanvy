# Multi-board support: design

## Status of this document

This is the design for the **"Multiboard support"** item spec §14 (and part
of §2.1's "final shape of the node/edge collections") flags as **deferred to
prototype-migration phase 2**. It is a design, not an implementation —
nothing described here exists in the code yet. It is actionable: a fresh
agent should be able to plan/implement schema v3 and the home-board UI
directly from this doc, but should surface the open questions in §6 rather
than silently deciding them.

Source of authority: a design conversation between the developer and an
agent (not a formal questionnaire like phase 1's). Where this doc doesn't
cover something, fall back to the v0 spec (`260915-kanvy-spec.md`) — nothing
here is meant to change existing single-board behavior except where
explicitly stated.

## 1. Scope

**In scope:**
- A `boards` collection; a reserved home board (`id === 'root'`).
- A new `board` card kind, usable only on the home board.
- Navigate into/out of boards; rename, duplicate, delete, multi-select boards
  from the home board.
- Containers on the home board, for (optionally nested) visual grouping of
  board nodes — the only nesting mechanism.
- Edges between board nodes.
- A confirm-modal primitive (new to this codebase) gating bulk board
  delete/duplicate/paste.
- Adopting TanStack Router for board navigation.

**Explicitly out of scope (do not build now):**
- Boards nested inside boards (infinite/recursive nesting). Grouping is via
  containers only; a container is not a board.
- Any card kind other than `board`/`container` on the home board.
- A real network/multi-user backend. Persistence stays as-is; see §5 for how
  navigation should still anticipate this.
- Collaboration/multiplayer, sharing/permissions.

## 2. Data model (schema v3)

- New top-level collection: `boards: { id, title, createdAt, updatedAt }[]`.
  Content (nodes/edges) does **not** live here — `boards` is metadata only.
- `id === 'root'` is reserved, always present, never deletable. Its title is
  fixed (e.g. "Home"), not user-renamable — it has no board-node representing it
  (it's the canvas you land on, not an item within itself).
- `nodes` and `edges` become **shared flat arrays across all boards**: every
  node/edge gains a `boardId` field (FK into `boards`).
  - Filtering by `boardId` before rendering preserves each board's own relative
    array order (and so its z-order, per spec §4.5/§2.3) regardless of how other
    boards' entries are interleaved in the flat array — no per-board ordering
    field is needed. Audit any reducer/undo logic that currently assumes "array
    index/length = global z-order" before this lands; that assumption breaks
    once multiple boards share one array.
  - `images` stays a single top-level map shared by id across all boards, as
    today — no change needed there.
- New `CardNode` kind: `kind: 'board'`, with a `boardRef: string` (id into
  `boards`). Carries the full `NodeBaseSchema` (`x/y/w/h/color/task?/
  createdAt/updatedAt`) like any other card — no board-specific stripped-down
  variant. Never has a heading size.
  - **No node-local caption/title field.** The displayed title is always
    `boards.find(b => b.id === boardRef).title` — the single source of truth.
    Both the on-canvas rename (§3) and the breadcrumb rename (§5) write to that
    same field, never to something on the node.
  - Board nodes are deduplicated: each board (other than the root board) has
    exactly one board-node instance, since a board only ever appears in one
    place (directly on the home board, or inside one container on it) — no
    multi-parenting to reconcile.
- **Deleting a board is a tombstone, not a real removal** (mechanism detail
  in §5): flip `boards[id].status` to `'trashed'`. Nodes/edges keep their
  `boardId` unchanged and are **not** individually flagged — every existing
  render/query path that already filters nodes by `boardId` excludes a
  trashed board's content for free, by also checking the owning board's
  `status`. This cascade (a whole board's worth of hidden content) is still
  the "hidden cost" the confirm-modal copy (§4) must surface, even though
  it's now reversible via undo, not merely recoverable-in-principle.

## 3. Home-board / board-node interaction

- The home board renders through the same `Canvas`/`Card` components as any
  other board — this is a content restriction, not a separate UI. Only
  `board` and `container` are creatable when `boardId === 'root'`; `text`/
  `image`/`link` creation paths are disabled there. Conversely, `board` is
  never creatable on any board other than root (no board-within-board).
- **Create:** double-click on root's canvas mints a new `boards` entry
  (default title, e.g. "Untitled board") and places a board-node at the
  click point — same trigger as today's plain-text-card creation
  (`useCardCreation.ts`), just root-gated to a different node kind.
- **Click semantics: reuse the link-node model exactly** (spec §5.4) —
  border/drag-handle = select, interior click = activate. The only
  deviation from the link node is *what* activation does: in-app navigation
  (route change, §5) rather than an `<a target="_blank">`.
- **Rename:** reuse the existing `showCaption`-style visibility rule
  (content-or-selected) that already governs link/image caption fields —
  the title field grows on select, pre-populated, fixed width (`CARD_WIDTH`,
  never resizes). Committing an edit writes to `boards[boardRef].title`.
- **Duplicate (⌘/Ctrl+D) and paste** of one or more board nodes: mint fresh
  `boards` entries and deep-copy every node/edge belonging to the source
  board(s) with new ids and the new `boardId`. Gated by the confirm modal
  (§4) — this can silently create far more content than the visible board
  count suggests.
- **Multiselect:** unmodified existing selection model (spec §4.3).
- **Containers for grouping:** the only nesting mechanism for boards is
  spatial containment via containers (spec §2.3), reused as-is, including
  nested containers if the current implementation already supports that
  depth. **Verify this before assuming it's free** (§7).
- **Edges between board nodes:** unmodified existing edge mechanism (spec
  §4.6) — board nodes are just nodes.
- **Color / task status / recency / view modes:** unmodified. Board nodes
  are full `CardNode`s, so standard view mode, done styling, and
  recency-mode borders/labels apply with zero board-specific code.

## 4. Confirm modal (new primitive)

Nothing like this exists in the app today — all deletion is currently
undo-only, with no confirm dialogs anywhere (spec §8). Build this as a
small, generic, reusable component (not board-specific), gating:

- Deleting selected board node(s).
- Duplicating or pasting selected board node(s).

Rules:
- Fires once per action, not once per board, even under multi-select.
- Copy should surface the *hidden* cost, not just the visible node count —
  e.g. "Delete 3 boards (47 nodes total)?" rather than just "Delete 3
  boards?" — since a board node standing in for a whole subtree is exactly
  the situation where the on-screen count understates the real effect.
- Scope is board nodes only (`boardId === 'root'`, node `kind === 'board'`).
  Plain card/container delete/duplicate elsewhere is unchanged — still
  undo-only, no modal.
- **Kept as a hard, blocking gate, not an act-then-toast pattern** — decided
  explicitly, not by default. Even though board delete/duplicate are now
  cheaply, reliably undoable (§5), the modal and undo solve different
  problems: the modal catches an accidental multi-select *before* it
  happens; undo recovers *after*, but only if the user notices in time and
  hasn't navigated on. A toast can be missed or dismissed by further
  action; a blocking confirm can't be.

## 5. Undo/redo

- **Per-board undo stacks**, not one global stack — a deliberate
  generalization of spec §8's "one shared history stack" (written when
  there was only one board to have a stack for). Undoing while viewing a
  board only ever affects that board's own history; there is no
  cross-board "undo just navigated me somewhere else" behavior to design
  around.
  - **Attribution rule for actions that span boards:** an action's history
    entry belongs to the board the user was acting *from*, not every board
    it happens to touch. Duplicating a board node on Home — which mints an
    entirely new board plus all of its content — is recorded as one atomic
    entry on **Home's** stack, not the new child board's.
  - History depth (100 steps, spec §8) applies per-board stack.
- **Board delete/duplicate/paste use the tombstone mechanism from §2**
  specifically so undo/redo on these actions is O(1) regardless of how much
  content the board contains: undo flips `status` back to `'active'`; redo
  flips it back to `'trashed'` (or, for duplicate/paste, undo tombstones the
  newly-minted board rather than actually discarding the copy). No
  reinsertion or recreation of nodes/edges ever happens on undo/redo of a
  board-level action.
  - **Emergent property:** because a tombstoned board's own content
    (including whatever undo history accumulated *inside* it) is never
    actually destroyed, undoing a board-delete from Home restores that
    board's own undo stack fully intact — no special-case handling needed
    for "what happens to a deleted board's history."
  - **Reaping:** tombstoned boards (and their nodes/edges/images) are only
    ever *actually* removed once the delete action has aged out of its
    board's 100-step undo window and can no longer be reached — otherwise
    tombstoning just relocates the memory/storage growth problem instead of
    solving it. Exact reaper trigger (on load, a background timer, or only
    on an explicit future "empty trash" action) is left open — see §7.
  - Plain card/container delete on any board (including Home) is
    unaffected by any of this — it stays true removal via the existing
    single-step undo mechanism, since it doesn't have the cascading-scale
    problem this section exists to solve.

## 6. Navigation

- Adopt **TanStack Router**, despite the app having zero routing
  infrastructure today (`App.tsx` is a flat, routerless composition; no
  `react-router`/`wouter`/`window.location`/`pushState` usage anywhere in
  `src`). Justification: a real (not speculative) future requirement to
  serve boards over a network makes router loaders the natural place to
  colocate per-board fetch/cache/pending-state logic later; a hand-rolled
  atom-based nav would need a second migration to retrofit that.
- Route shape: one pattern, `/board/:boardId`. The root board is the "home"
  screen and is the root of the URL — `/` redirects to `/board/root`.
- The route's loader reads the board from local state for now. Structure it
  so a future swap to a network fetch is a loader-implementation change
  only — it should not require touching breadcrumb/navigation call sites.
- **Breadcrumb** (header bar): home icon (→ `/board/root`) + chevron +
  current board's title, editable inline, writing to the same
  `boards[boardId].title` as the on-canvas rename (§3). Nesting is capped at
  one level, so the breadcrumb never renders more than these two segments.
  The rename control must not appear (or must be disabled) when
  `boardId === 'root'`, since root's title is fixed (§2).
- Deep-linking (share/bookmark a URL straight to a board) falls out of this
  route shape for free. It's not itself a requirement to build extra
  scaffolding around yet — just don't do anything that would prevent it.

## 7. Explicitly deferred / open questions for the implementer

- **Verify container nesting depth.** Confirm the current container
  implementation already supports arbitrary (not just one-level) nesting
  before assuming "nested groups of boards" needs no new container work.
- **Root board identity.** Confirmed as fixed-title/non-renamable above —
  flagging because it means the rename affordance (on-canvas and breadcrumb)
  needs an explicit "am I root" check, not just "is anything selected."
- **Duplicate/paste of a board that itself sits inside a duplicated
  container** should fall out automatically from "copy every node/edge
  whose `boardId` matches the copied board(s)," same as any other contained
  content — call out for implementation-time verification, not a separate
  mechanism.
- **Reducer/undo z-order assumptions** (§2) — audit before landing the
  shared flat `nodes`/`edges` array change.
- **Reaper trigger for tombstoned boards** (§5) — on-load sweep, background
  timer, or deferred until an explicit future "empty trash" UI exists. Not
  decided; any option is acceptable as long as reaping only ever happens
  after a delete has aged out of its board's undo window.
- **Confirm-modal component API/placement** is a genuinely new UI element —
  design it as a generic primitive even though board delete/duplicate is
  the only caller for now.
- **Network/multi-user backend** timing and shape is unresolved and out of
  scope here; the loader abstraction in §6 should anticipate it without
  implementing it.

## 8. Relationship to existing phase tracking

This doc is the design deliverable for spec §14's "Multiboard support —
prototype-migration phase 2" line, and settles part of that same section's
"final shape of the node/edge collections" question (shared `nodes`/`edges`
arrays, `boardId`-scoped, per §2 above) for the multi-board case
specifically.
