# Multiboard follow-up: URL scheme + board-title visibility

## Status

Two developer-requested revisions to the multiboard support work landed in
`ctx/notes/260917-multiboard-support-design.md` /
`ctx/notes/260917-multiboard-implementation-plan.md`, both implemented and
covered by `e2e/multiboard.spec.ts`. This note is the record of *what
changed and why*; the design doc's §3/§6 carry pointers here, and the
implementation plan is left as an unedited historical record (same
convention as `260916-v0.1-spatial-containers.md`).

## 1. Board-card titles are always visible on the canvas

**Before:** a board card's title field followed the same
content-or-selected `showCaption` rule as link/image captions (design doc
§3) — since a board node never has `content`, this meant the title was
invisible unless the card was selected.

**After:** `Card.tsx`'s `showCaption` computation always returns `true` for
`kind === 'board'`, matching the always-visible treatment a text card's
caption already gets. The title is still only *editable* once you click
into the field directly — that hasn't changed, and selecting the card via
its border (`card__bar`) still exists for delete/duplicate/multiselect
purposes, it's just no longer a precondition for the title being *visible*.

Since board cards only ever exist on the home/root board (design doc §1:
"usable only on the home board"), "visible even when not selected, while
looking at the home board" and "visible even when not selected" are the
same condition in practice — there's no other board a board-card could
appear on to distinguish them.

Changed: `src/components/card/Card.tsx` (`showCaption`).
Test: `e2e/multiboard.spec.ts` — "a board card shows its title on the
canvas even when not selected".

## 2. URL scheme: home board is `/`, every other board is `/<id>`

**Before:** one route pattern, `/board/$boardId`; `/` redirected to
`/board/root`.

**After:** two route patterns — `/` renders the home/root board directly
(no redirect involved for the common case), and `/$boardId` handles every
other board, redirecting to `/` if `boardId` is the reserved root id or
names an unknown/trashed board. `boardRoute`'s `beforeLoad` guard is
otherwise unchanged (still reads the live `boards` collection via jotai's
default store).

Rationale for keeping `/root` as a redirect-to-`/` case (rather than, say,
making it a 404): a stale/hand-typed `/root` URL should behave the same
as any other unknown path here — land on home — rather than being a
special error case, consistent with the existing "unknown board id"
fallback behavior.

Changed:
- `src/router.tsx` — route tree, `BoardRouteComponent`.
- `src/components/canvas/BoardPage.tsx` — now takes `boardId` as a prop
  instead of reading route params directly (needed since it's shared by
  both the home route, which has no `boardId` param, and the `/$boardId`
  route).
- `src/components/breadcrumb/Breadcrumb.tsx` — home link now points to
  `/` instead of `/board/$boardId` with `boardId: 'root'`.
- `src/components/card/CardBody.tsx` — board-card click-to-navigate now
  targets `/$boardId` instead of `/board/$boardId`.
- `e2e/multiboard.spec.ts`, `e2e/cards.spec.ts`, `e2e/clipboard.spec.ts`,
  `e2e/fixtures/board.ts` — all direct `page.goto`/URL assertions updated
  to the new scheme; added a test for `/root` redirecting to `/`.

No schema/data-model changes — this is purely the route layer.
