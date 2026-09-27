# First-time-visit welcome-board redirect — what it is, and an e2e/testing gotcha it causes

## Status

This behavior itself isn't new (landed in `c303e7d "improve new board
behavior"`, 2026-09-18, alongside the `260918-url-scheme-and-board-title-
visibility.md` revision, but was never given its own note). Writing this
now because it caused several confusing e2e failures (see "Testing
implications" below) and because tracing it down turned up a related gap
(see "Known gap" below) that's worth flagging even though it's out of
scope for this note to fix.

## The behavior

On a genuinely fresh profile (nothing at all under the `kanvy.board`
localStorage key — `raw === null` in `state/persistence/storage.ts`'s
`loadBoard()`), the app does **not** land the user on the empty home/root
board. Instead:

- `loadBoard()` mints a fresh seed document (`schema/seed.ts`'s
  `createSeedBoard()`) containing two boards — `root` ("Home", with just a
  board-card node pointing at the other one) and a new randomly-id'd
  "welcome" board (title "My Kanvy Board", one text card: "Welcome to
  Kanvy\n\nDouble-click the canvas to add a note.") — and returns that
  welcome board's id as `freshBoardId`.
- `state/history/boardHistoryAtom.ts`'s `freshBoardIdAtom` is seeded from
  that value at module-load time.
- `router.tsx`'s `/` route's `beforeLoad` reads `freshBoardIdAtom`; if
  set, it redirects to `/$boardId` (the welcome board) instead of
  rendering root, then clears the atom back to `undefined` so a later,
  deliberate in-session visit to `/` isn't redirected again.

Net effect: `page.goto('/')` (or any app boot) on a truly empty profile
sends the user straight into a non-home "My Kanvy Board" — this is
intentional onboarding behavior, not a bug, and not something to "fix"
without a product decision to change it.

## Testing implications

Any e2e test that needs to land on **root** itself (URL `/`, no editable
breadcrumb title, etc.) must seed an already-non-fresh document into
`kanvy.board` *before* the first `page.goto('/')`, the same way
`settingsNetworkMode.spec.ts` already did (see its own "brand-new-user
onboarding redirect" comment) — otherwise the fresh-visit redirect fires
and the test ends up on some other board entirely. `e2e/multiboard.spec.ts`
followed this convention as of 2026-09-27; before that its root-path/
breadcrumb tests (predating this feature, written during multiboard
Sub-phase 3) assumed a bare `page.goto('/')` stays on `/`, which broke
once this feature shipped.

`multiboard.spec.ts` now also has an explicit test for the redirect itself
("a brand-new profile ... is redirected from / to a freshly-minted welcome
board"), since nothing in the suite previously asserted this on-purpose
behavior directly.

## Known gap (not fixed here — flagging for a product/dev decision)

The freshly-minted seed board is **never actually written to
localStorage** until the user makes their first edit — `saver.save()`
(the debounced localStorage/network write) is only ever invoked from
`updateBoardAtom`/undo/redo (state/history/boardHistoryAtom.ts), never on
initial load. Practically: if a brand-new user loads the app and reloads
the page (or the tab crashes/closes) before touching anything, the welcome
board they just saw is silently discarded, and the *next* load mints an
entirely different random welcome board — same content, different id —
rather than returning to the one already shown. This only matters for the
narrow window before a first edit; once anything is edited, normal
autosave takes over and this doesn't recur. Not fixed as part of this
note — surfacing it for a decision on whether onboarding should persist
eagerly.
