# Board node redesign: single row, shared hover-to-edit control

## Status

Second developer-requested revision to the board node/multiboard UI in one
day, following `ctx/notes/260918-url-scheme-and-board-title-visibility.md`
(which made the title always-visible but kept the old big-centered-icon +
separate-caption-row layout). This note replaces that layout entirely and
introduces a shared editing control. Both are implemented and covered by
`e2e/multiboard.spec.ts`.

## What changed

**Before** (as of the previous revision): a board card had a large centered
`LayoutGrid` icon filling most of the card, with the (always-visible, per
the previous revision) title as a separate `<input>` row below it. The
breadcrumb's title was a plain button that entered edit-on-click directly,
with its own hand-rolled state in `Breadcrumb.tsx`.

**After:** the developer judged the big-icon layout as not fitting the
card system's existing patterns, and asked for a full redesign:

- The board card is now **one primary row**: a left-aligned `LayoutDashboard`
  icon, then the board's name at a larger-than-usual font size (1rem vs.
  the card system's normal 0.85rem), with generous spacing between them.
  Still always visible (unchanged from the previous revision); width
  starts at `CARD_WIDTH` but is now user-resizable via east/west drag
  handles (`geometry/constants.ts`'s `BOARD_MIN_W` floor, no max) — added
  260918, after developer feedback that longer board names needed
  room to breathe. Board cards otherwise stay unresizable vertically
  (height is still content/CSS-driven, as for every other non-heading
  card).
- **Interaction model:** when not editing, the whole icon+name area is a
  single button that activates (navigates into the board) on click — same
  click-to-navigate semantics the link card already uses for its interior,
  just narrowed from "the whole card interior" to "the icon+name row"
  (design doc §3's click-semantics bullet).
- **Editing:** hovering over the name reveals a pencil (edit) button.
  Clicking it enters edit mode: the name becomes an `<input>`, and the
  pencil is replaced *in the same slot* by a checkmark — an explicit,
  visible "you are now editing / here's how you leave" affordance, rather
  than a mode change with no on-screen indication of how to exit. Exiting
  edit mode: blur (click away), Enter, or clicking the checkmark all
  commit; Escape cancels without saving.
- **Shared component:** this whole control — hover-reveal pencil, edit
  state, checkmark, commit/cancel semantics — is `BoardNameEditor`
  (`src/components/board/BoardNameEditor.tsx`), used by *both* the board
  card (`CardBody.tsx`, with an icon and `onActivate` for navigation) and
  the breadcrumb (`Breadcrumb.tsx`, with neither — it has no "activate"
  concept for the board it's already on). This was an explicit ask: "make
  THAT (hover for edit icon) the pattern we use for the board name in the
  breadcrumb for consistency." The breadcrumb's previous click-directly-
  to-edit interaction is gone; it now matches the card's hover-then-pencil
  pattern exactly.

## Implementation notes

- `BoardNameEditor` renders three shapes depending on props/state:
  icon+text-as-button (card, not editing), icon+text-as-plain-span
  (breadcrumb, not editing — no `onActivate` prop), and icon+input+
  checkmark (either, editing). The icon prop is optional and omitted by
  the breadcrumb.
- The confirm (checkmark) button uses `onMouseDown={e => e.preventDefault()}`
  to keep focus in the input through the click — otherwise the input's
  `onBlur` (which also commits) fires first and moves/removes the
  checkmark before its own `onClick` can land, a common React pitfall with
  "confirm this input" buttons.
- Pencil-button clicks call `stopPropagation()` so they don't also trigger
  the card's `onActivate` (they're nested inside the same row, not inside
  the activate button itself, so this matters only for consistency/
  robustness, not to prevent an actual nested-button HTML violation).
- The card row keeps the `.no-drag` class (on the wrapping
  `.card__board-body` div, as before) so pointer-down inside it never
  starts a card drag — but, same as every other card kind, a pointer-down
  anywhere inside the card (including on the pencil) still *selects* the
  card first (`useBoardInteraction.ts`'s `handleNodePointerDown`: the
  `.no-drag` check only skips the *drag-start*, selection always happens).
  This is pre-existing, unchanged behavior — not something this redesign
  introduced — and it's why clicking the pencil also shows the selection
  menu around the card in practice.
- CSS: the edit-pencil is opacity-0 by default, revealed via
  `:hover`/`:focus-within` on the wrapping `.board-name`, with a
  `@media (hover: none)` fallback that always shows it — touch devices
  don't have a hover state to reveal it with. (This fallback matches the
  local e2e harness's `hasTouch: true` context option — see
  `playwright.config.ts` — which reports `(hover: none)` even though the
  actual browser has a mouse; a screenshot taken through that harness will
  always show the pencil, unlike a real hover-capable desktop session.)
- Removed: `.card__board-body`'s old centered-big-icon styling, the
  `showCaption`-gates-board-kind special case in `Card.tsx` (board no
  longer reads `showCaption` at all — always rendered unconditionally in
  `CardBody.tsx`), the `LayoutGrid` icon import, and `Breadcrumb.tsx`'s
  own hand-rolled edit-state (`draft`/`inputRef`/`commit`) — all replaced
  by `BoardNameEditor`.

Changed files: `src/components/board/BoardNameEditor.tsx` (new),
`src/components/card/CardBody.tsx`, `src/components/card/Card.tsx`,
`src/components/breadcrumb/Breadcrumb.tsx`, `src/index.css`,
`e2e/multiboard.spec.ts`.
