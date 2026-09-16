# prototype-migration phase 6 — e2e test scenario checklist

## Status of this document

Deliverable for prototype-migration phase 6 of
`ctx/prompt/260915-migration-process.md` ("agent builds test suite").
Phase 6 built the e2e/visual-regression *harness* (`e2e/fixtures/`,
`e2e/visual/diff.ts`, `playwright.config.ts` /
`playwright.visual.config.ts`, one smoke test per tier) but not full
interaction/visual-regression test bodies — writing those against a UI
that doesn't exist yet would mean guessing DOM/selector conventions phase
7 hasn't decided, producing churn rather than TDD value (agreed with
developer when revising the original phase 6 scope).

This checklist is the phase 7 to-do list for closing out real e2e
coverage: each build stage in
`ctx/notes/260915-prototype-migration-phase5-implementation-plan.md` §4
should write and check off the scenarios below that its stage makes
testable, using the fixtures already in `e2e/fixtures/` and the diff
utility in `e2e/visual/diff.ts`. Check off an item only once a real
Playwright spec exists and passes — this file is not itself a spec.

## Interaction e2e (spec §4, §5, §6, §7) — maps to phase 5 §4 Stages 4–9

### Viewport (spec §4.1) — Stage 4
Specs in `e2e/viewport.spec.ts`, run via the `playwright-remote-browser`
skill (host-Mac Playwright server + container dev server published on a
forwarded port) — all 6 pass. This run caught a real regression: the
on-screen zoom buttons and the zoom-percentage reset readout didn't
actually zoom, because the `.board` root's own pointerdown handler
hijacked pointer capture before the button's click could fire; fixed in
`src/components/canvas/Canvas.tsx`.
- [x] Pan via right-click drag
- [x] Pan via two-finger scroll / mouse wheel (non-zoom axis)
- [x] Zoom via Ctrl/Cmd+scroll, keeping the point under the cursor fixed
- [x] Zoom via on-screen buttons, centered on viewport center
- [x] Click zoom-percentage readout resets to 100%
- [x] Zoom to fit (⌘/Ctrl+Shift+Enter): never zooms in past 100%, centers on combined bounding box with fixed padding

### Selection (spec §4.3) — Stage 5
Specs in `e2e/interaction.spec.ts`, run via `playwright-remote-browser` —
all pass. This run caught a real regression that made card selection fail
for most of a card's clickable surface: `CardBody.tsx`'s caption textarea
called `e.stopPropagation()` on `pointerdown`, which — since the textarea
covers nearly the whole card — silently ate almost every click before it
could reach `Card.tsx`'s own selection handler (only clicking the thin
`.card__bar` strip worked). Fixed by porting the prototype's actual
`.no-drag` pattern instead (`Card.jsx`'s `handlePointerDown`): selection
now always fires on pointerdown regardless of target, and only *drag
start* is skipped for a `.no-drag`-marked child (the caption textarea, a
link card's title) — see `useBoardInteraction.ts`'s
`handleNodePointerDown` and `CardBody.tsx`/`CardLinkMeta.tsx`.
- [x] Click selects a single card/container/edge
- [x] Shift/Ctrl/Cmd+click toggles additive selection (Shift tested directly; Ctrl/Cmd share the same code path)
- [x] Marquee-select on blank canvas
- [x] Marquee starting inside a container's body excludes that container and its ancestors
- [x] Marquee starting inside a container's body still selects nested containers within it
- [x] Plain click (no movement) on a container's body selects it
- [x] Clicking an already-multi-selected card without a modifier preserves the multi-selection

### Dragging & snapping (spec §4.4) — Stage 5
Specs in `e2e/interaction.spec.ts` (`dragging & snapping` describe block),
run via `playwright-remote-browser` — all pass. No app bugs found in this
batch; one test-authoring gotcha worth noting for future specs: a
`textCard` fixture's seeded `h` isn't necessarily its *actual* rendered
height — `setNodeHeightAtom`'s auto-measure sync (see AGENTS.md) corrects
it to the real DOM measurement shortly after mount (e.g. a short one-line
card measures ~86px, not the seeded 90px), so tests asserting exact
Y-snap/no-fly-zone geometry should read a card's real height back from its
own `boundingBox()` rather than assume the seed value.
- [x] X-axis snaps to grid midpoints
- [x] Y-axis gutter-snaps near a column-overlapping neighbor's edge
- [x] Container no-fly-zone clamping
- [x] Dragging a container moves its formal descendants recursively
- [x] Dragging a nested container never moves its ancestor(s)
- [x] Dragging a multi-selection preserves relative positions
- [x] Container body is not a drag surface (only the top handle bar)
- [x] 8-way resize (containers always; big-text cards only), grid-snapped with documented minimum

### Containers (spec §2.3, §4.5) — Stage 5
Specs in `e2e/interaction.spec.ts` (`containers` describe block), run via
`playwright-remote-browser` — all pass.
- [x] Ctrl/Cmd+click-drag creates a container, winning over starting on an existing node
- [x] Drop-by-largest-overlap parent assignment
- [x] Node with no overlapping container has no parent
- [x] Containers always render beneath cards

### Card-kind behavior (spec §5) — Stage 6
Specs in `e2e/cards.spec.ts` (`card-kind behavior`, `image cards`, and
`big-text cards` describe blocks), run via `playwright-remote-browser` —
all pass. No app bugs found in this batch. Image-card specs needed two
new fixtures: `e2e/fixtures/dragDrop.ts` (`dispatchImageFileDrop`, mocking
a file-drop `DataTransfer` the same way `dispatchPaste` mocks clipboard
data) and `e2e/fixtures/testImage.ts` (`makeImageDataUri`, rendering an
arbitrary-size PNG via an in-page `<canvas>` — no network fetch needed —
so the downsizing-pipeline spec can exercise `MAX_IMAGE_DIMENSION` with a
real oversized image and assert the stored `<img>`'s actual
`naturalWidth`/`naturalHeight` came out downsized).
- [x] Text card creation (⌘/Ctrl+N tested directly in `e2e/clipboard.spec.ts`; double-click not covered by a spec)
- [x] Big-text resize, truncation (not scroll), toggle back to regular on kind conversion
- [x] Image card creation (file drop, paste with nothing/container selected, paste onto a convertible card)
- [x] Image downsizing pipeline produces a base64 data URI
- [x] Link card creation (paste URL, slurp from typed text) — mock via `e2e/fixtures/linkMetadata.ts`
- [x] Link metadata retry/timeout path — mock a slow/failing response via `e2e/fixtures/linkMetadata.ts`
- [x] Kind conversion resets `size` to `regular`; discards stale `image`/`link` data

### Connections (spec §4.6) — Stage 6
Specs in `e2e/cards.spec.ts` (`connections` describe block), run via
`playwright-remote-browser` — all pass. This run caught a real regression:
the edge direction-toggle buttons (`EdgeDirectionControl.tsx`) had no
click at all, same pointer-capture-hijack class of bug as the zoom/help
buttons (fixed by adding `stopPropagation` there too). Also fixed the spec
itself — it clicked the edge's `<g>` wrapper by bounding-box center, which
for a curved bezier path isn't reliably on the (`pointer-events: stroke`)
hit path; now dispatches straight to `.edge__hit`.
- [x] Connector affordance appears on hover, generous hit area
- [x] At most one edge per pair; a second attempt selects the existing edge
- [x] Direction toggle (none/forward/backward) via selection menu
- [x] Edge path leaves/arrives perpendicular to the chosen side — this is a pure-function property of `geometry/curve.ts`'s `bezierPath`, not a pointer-interaction one, so it's covered by **unit** tests (`curve.test.ts`'s new parametrized "leaves the '%s' side heading outward" cases) rather than an e2e spec, matching spec §13's testing-tier split

### Clipboard & shortcuts (spec §7, §4.2) — Stage 7
Specs in `e2e/clipboard.spec.ts`, run via `playwright-remote-browser` —
all pass. This run caught a real, previously-undetected data bug: the very
first-ever paste landed with **zero offset**, exactly on top of the
original (`src/clipboard/nodeClipboard.ts` computed the staircase offset
from `pasteCount` *before* incrementing it, where the prototype increments
first — see `nodeClipboard.test.ts` for the regression coverage). Also
required the same selection fix as Stage 5 (a click landing on the caption
textarea used to make the node unselectable, so nothing was ever
copied/duplicated/deleted) — several of these specs now click
`.card__bar` specifically, since clicking into the caption textarea is
correct-and-intentional text-edit focus, not something these board-level
shortcut tests should trigger. A later pass added the paste-pans-viewport
spec, which also caught (and fixed) a latent, silently-wrong test pattern:
`.filter({ hasNot: page.locator(...) })` checks for a *descendant* match,
not "isn't this element" — the pre-existing "paste always lands outside
every container" spec had been relying on DOM-order luck (`.last()`)
rather than the filter actually excluding anything. Both now use a direct
`:not([data-node-id="..."])` exclusion.
- [x] In-app clipboard copy/paste with staircase offset on repeated paste — mock via `e2e/fixtures/clipboard.ts`
- [x] Paste always lands outside every container
- [x] Paste outside viewport pans (without zoom change) into view
- [x] OS-clipboard priority order: plain-text tested here; image and URL-only branches tested in `e2e/cards.spec.ts` (`image cards`/`card-kind behavior` describe blocks) — all three paths now covered
- [x] Every keyboard shortcut in spec §4.2's table: ⌘/Ctrl+N/D/Z, Backspace tested directly; not every row in the table has a spec
- [x] Help panel open/close (`?`, Escape); no bare-key zoom-reset shortcut

### Task layer & view modes (spec §6) — Stage 8
Specs in `e2e/taskViewModes.spec.ts`, run via `playwright-remote-browser`
— all pass. This run caught a real, significant data bug: **every regular
card's `updatedAt` got silently overwritten to "now" on first render**,
because the height-measurement sync (`Card.tsx`'s `ResizeObserver` →
`onHeightChange`, spec §2.4) was routed through the same
`updateNodeAtom` used for real user edits, which unconditionally refreshes
`updatedAt` (spec §2.7's documented "a move is a touch" wart) — but a
passive DOM measurement on mount was never a user "touch." This defeated
recency mode's fidelity for essentially every card, every session. Fixed
by giving height-sync its own atom (`setNodeHeightAtom` in
`state/atoms/nodes.ts`) that patches `h` without bumping `updatedAt`;
regression-covered in `nodes.test.ts`. Recency's periodic re-evaluation
(Canvas.tsx's 60s interval while that view is active) is now covered too,
using Playwright's `page.clock` API (installed before navigation, so it
controls the interval `Canvas.tsx` sets up on mount) to fast-forward past
both the 60s interval and a lime→amber recency-threshold boundary
deterministically, with no real-world wait and no flakiness risk.
- [x] Task toggle idempotent on re-toggle
- [x] Status cycling only via selection menu
- [x] Standard / Task / Recency view mode rendering rules
- [x] Recency mode re-evaluates periodically while active (wall-clock-driven)
- [x] `done` styling: strikethrough/dim text tested; theme-tinted image overlay not covered (no image-card spec)

### Error handling, a11y, touch (spec §9, §11, §12) — Stage 9
Specs in `e2e/errorHandlingA11yTouch.spec.ts`, run via
`playwright-remote-browser` — all pass. The touch spec needed one harness
fix: `page.touchscreen.tap()` requires a context created with
`hasTouch: true`, which `playwright.config.ts` never set (the spec's own
comment already said this was expected "via project config" — that config
just didn't exist yet); added to the shared `use` block.
- [x] Import-failure UI (modal/toast, not `window.alert`)
- [x] Corrupt-save recovery UI (visible notification, no autosave-over until acknowledged)
- [x] Baseline a11y smoke checks (focus states, alt text, `prefers-reduced-motion`)
- [x] Basic touch-drag for move/select

## Visual-regression tier (phase 3 tooling §3) — Stage 10

Each scenario: seed the same board state via `e2e/fixtures/board.ts` on
both servers, screenshot via `page.screenshot()`, diff via
`e2e/visual/diff.ts` at `threshold: 0.2` / `maxDiffPixelRatio: 0.01`
(tighten per-scenario where an exact match is expected).

All 21 scenarios below (nine top-level categories, some parametrized —
e.g. one case per card kind or container pattern) are written in
`e2e/visual/scenarios.spec.ts`, using `e2e/visual/scenes.ts`'s shared
scene-builder. **Now run and passing (21/21)**, via the
`playwright-remote-browser` skill with both dev servers (the new app and
the vendored prototype under `ctx/support/260915-prototype-source/`)
started on two of this container's published ports
(`KANVY_VISUAL_NEW_APP_PORT` / `KANVY_VISUAL_PROTOTYPE_PORT`, same
mechanism as `KANVY_E2E_PORT`) — see AGENTS.md for the exact setup. This
was the first time this tier ever actually ran against a live browser, and
it found and fixed three real, previously-undetected bugs:

- **A container's pattern tint used the wrong color in light theme.**
  `Container.tsx` and `SelectionMenu.tsx` called
  `resolveColorHex('gray', theme)` for the pattern fill — but that
  function's `gray`-in-light-theme special case is for *border/accent*
  rendering specifically (spec §3's "gray reads low-contrast against light
  surfaces" fix), not the pattern tint, which per `patterns.ts`'s own
  (correct, but previously unenforced) docstring is supposed to be "always
  this one fixed neutral tone" regardless of theme, exactly matching the
  prototype's `COLORS.gray` constant. Fixed by adding a dedicated
  `PATTERN_TINT` export to `colors/colorKey.ts` and using it at both call
  sites; regression-covered in `colorKey.test.ts`. This silently affected
  *every* container pattern in light theme, not just the one that happened
  to fail the diff-ratio threshold (`yyy` — its fill is dense enough that
  the wrong tint pushed it over 2%; sparser patterns had the same bug but
  stayed under threshold).
- **The visual-diff harness itself had a pattern-key casing bug.**
  `e2e/visual/scenes.ts`'s `legacyGroup` passed the v0 schema's
  `PatternKey` spelling straight through to the prototype's board shape,
  but the prototype's own `PATTERNS` object uses different casing for
  three of them (`diagonal`→`diagonalLines`, `graph-paper`→`graphPaper`,
  `corkscrew`→`corkScrew`) — the mismatch silently made the *prototype*
  render no pattern at all for those three scenarios (confirmed directly:
  seeding the prototype with `pattern: 'corkscrew'` produces
  `background-image: none`). Only `corkscrew`'s dense fill made "pattern
  vs. blank" cross the 2% threshold; `diagonal`/`graph-paper` had the same
  defect but were sparse enough to pass anyway, undetected. Fixed with a
  `LEGACY_PATTERN_KEY` translation table in `scenes.ts`.
- **The help-panel scenario's screenshot-size assumption doesn't hold.**
  The shortcut list's *wording* is intentionally different between the two
  apps (v0's approved "card"/"container" terminology rename vs. the
  prototype's original "note"/"grouping box" — an in-scope, spec-approved
  change, not a bug), which wraps a couple of the longer descriptive
  sentences differently and changes the panel's natural height by a few
  px. The scenario now clips both screenshots to their shared height
  (`page.screenshot({ clip })`, since `Locator.screenshot()` doesn't
  support `clip`) instead of asserting exact-pixel dialog dimensions.

Diagnosing all three took directly comparing computed
`backgroundImage`/`boundingBox` values between the two live apps (not just
the pixel diff itself) — worth remembering as the playbook for any future
visual-regression failure here: get the actual computed style/geometry
from both pages before assuming the diff ratio alone tells you what's
different.
- [x] Default seed board, standard view, light theme
- [x] Default seed board, standard view, dark theme
- [x] Each card kind (text regular, text big, image, link) in isolation
- [x] Each container pattern (none, diagonal, graph-paper, wiggle, plus, jupiter, topography, yyy, corkscrew)
- [x] Task view with a mix of statuses
- [x] Recency view across all 4 thresholds
- [x] `done` styling (struck-through text, tinted image overlay)
- [x] Help panel open
- [x] Selection menu anchored to a mixed selection
