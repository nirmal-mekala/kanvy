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
- [ ] Marquee starting inside a container's body still selects nested containers within it
- [x] Plain click (no movement) on a container's body selects it
- [x] Clicking an already-multi-selected card without a modifier preserves the multi-selection

### Dragging & snapping (spec §4.4) — Stage 5
Specs in `e2e/interaction.spec.ts` (`dragging & snapping` describe block),
run via `playwright-remote-browser` — all pass (once unblocked by the
selection-locator fix above; dragging itself needed no code changes).
- [x] X-axis snaps to grid midpoints
- [ ] Y-axis gutter-snaps near a column-overlapping neighbor's edge
- [ ] Container no-fly-zone clamping
- [x] Dragging a container moves its formal descendants recursively
- [ ] Dragging a nested container never moves its ancestor(s)
- [ ] Dragging a multi-selection preserves relative positions
- [x] Container body is not a drag surface (only the top handle bar)
- [x] 8-way resize (containers always; big-text cards only), grid-snapped with documented minimum

### Containers (spec §2.3, §4.5) — Stage 5
Specs in `e2e/interaction.spec.ts` (`containers` describe block), run via
`playwright-remote-browser` — all pass.
- [x] Ctrl/Cmd+click-drag creates a container, winning over starting on an existing node
- [x] Drop-by-largest-overlap parent assignment
- [ ] Node with no overlapping container has no parent
- [ ] Containers always render beneath cards

### Card-kind behavior (spec §5) — Stage 6
Specs in `e2e/cards.spec.ts` (`card-kind behavior` describe block), run via
`playwright-remote-browser` — all pass.
- [x] Text card creation (⌘/Ctrl+N tested directly in `e2e/clipboard.spec.ts`; double-click not covered by a spec)
- [ ] Big-text resize, truncation (not scroll), toggle back to regular on kind conversion
- [ ] Image card creation (file drop, paste with nothing/container selected, paste onto a convertible card)
- [ ] Image downsizing pipeline produces a base64 data URI
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
- [ ] Edge path leaves/arrives perpendicular to the chosen side (no spec asserts the path geometry itself)

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
shortcut tests should trigger.
- [x] In-app clipboard copy/paste with staircase offset on repeated paste — mock via `e2e/fixtures/clipboard.ts`
- [x] Paste always lands outside every container
- [ ] Paste outside viewport pans (without zoom change) into view
- [x] OS-clipboard priority order: plain-text branch tested directly; image/URL-only branches not covered by a spec
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
(Canvas.tsx's 60s interval while that view is active) still isn't covered
by a spec — awkward to assert deterministically without fake timers wired
through the harness; verify manually or add a spec later if this becomes a
real gap.
- [x] Task toggle idempotent on re-toggle
- [x] Status cycling only via selection menu
- [x] Standard / Task / Recency view mode rendering rules
- [ ] Recency mode re-evaluates periodically while active (wall-clock-driven)
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

All nine scenarios below are written in `e2e/visual/scenarios.spec.ts`,
using `e2e/visual/scenes.ts`'s shared scene-builder (one scenario
description compiled into both the new app's v0 schema and the
prototype's legacy `{cards, groups, edges}` shape, verified field-by-field
against `ctx/support/260915-prototype-source/src/data/board.js` and
`src/schema/node.ts` — see that file's own comments for the exact
evidence) — but **not run to a passing result**: same hard environment
limitation as every interaction-e2e section above (confirmed again this
stage: `pnpm e2e` fails locally with the missing-`libglib` error, and the
host-Mac remote-browser workaround still has no route back into this
container's dev server). Run `pnpm e2e:visual:setup` once and then `pnpm
e2e:visual` for real (CI, or a dev environment without this networking
split) before checking any of these off — do not check based on code
review alone.
- [ ] Default seed board, standard view, light theme
- [ ] Default seed board, standard view, dark theme
- [ ] Each card kind (text regular, text big, image, link) in isolation
- [ ] Each container pattern (none, diagonal, graph-paper, wiggle, plus, jupiter, topography, yyy, corkscrew)
- [ ] Task view with a mix of statuses
- [ ] Recency view across all 4 thresholds
- [ ] `done` styling (struck-through text, tinted image overlay)
- [ ] Help panel open
- [ ] Selection menu anchored to a mixed selection
