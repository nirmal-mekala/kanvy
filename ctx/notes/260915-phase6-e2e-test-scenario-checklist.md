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
Specs written in `e2e/viewport.spec.ts` against Stage 4's actual DOM, but
**not run to a passing result** — this session's sandboxed dev container has
no local browser (no display server, cached Chromium binaries fail to
launch — see `playwright-remote-browser` skill) and, despite a Playwright
server reachable on the host Mac (`ws://host.docker.internal:3322/`
connects fine), the host has no route back into this container's bridge IP
to load the dev server itself (`page.goto` to the container's own
`--host`-bound address times out, not refused — consistent with Docker
Desktop's asymmetric host↔container networking with no port published).
Run `pnpm e2e` for real (CI, or a dev environment without this split) before
checking any of these off — do not check based on code review alone.
- [ ] Pan via right-click drag
- [ ] Pan via two-finger scroll / mouse wheel (non-zoom axis)
- [ ] Zoom via Ctrl/Cmd+scroll, keeping the point under the cursor fixed
- [ ] Zoom via on-screen buttons, centered on viewport center
- [ ] Click zoom-percentage readout resets to 100%
- [ ] Zoom to fit (⌘/Ctrl+Shift+Enter): never zooms in past 100%, centers on combined bounding box with fixed padding

### Selection (spec §4.3) — Stage 5
Specs written in `e2e/interaction.spec.ts` against Stage 5's actual DOM
(`[data-node-id]`, `.card--selected`/`.container-node--selected`,
`.container-node__drag-handle`, `.resize-handle--<dir>`), but **not run to a
passing result** — same environment limitation noted under Stage 4 above
(no local browser in this container; no network path from the host-Mac
remote browser back into this container's dev server). Run `pnpm e2e` for
real before checking any of these off.
- [ ] Click selects a single card/container/edge
- [ ] Shift/Ctrl/Cmd+click toggles additive selection
- [ ] Marquee-select on blank canvas
- [ ] Marquee starting inside a container's body excludes that container and its ancestors
- [ ] Marquee starting inside a container's body still selects nested containers within it
- [ ] Plain click (no movement) on a container's body selects it
- [ ] Clicking an already-multi-selected card without a modifier preserves the multi-selection

### Dragging & snapping (spec §4.4) — Stage 5
- [ ] X-axis snaps to grid midpoints
- [ ] Y-axis gutter-snaps near a column-overlapping neighbor's edge
- [ ] Container no-fly-zone clamping
- [ ] Dragging a container moves its formal descendants recursively
- [ ] Dragging a nested container never moves its ancestor(s)
- [ ] Dragging a multi-selection preserves relative positions
- [ ] Container body is not a drag surface (only the top handle bar)
- [ ] 8-way resize (containers always; big-text cards only), grid-snapped with documented minimum

### Containers (spec §2.3, §4.5) — Stage 5
- [ ] Ctrl/Cmd+click-drag creates a container, winning over starting on an existing node
- [ ] Drop-by-largest-overlap parent assignment
- [ ] Node with no overlapping container has no parent
- [ ] Containers always render beneath cards

### Card-kind behavior (spec §5) — Stage 6
- [ ] Text card creation (double-click, ⌘/Ctrl+N, typing/pasting plain text)
- [ ] Big-text resize, truncation (not scroll), toggle back to regular on kind conversion
- [ ] Image card creation (file drop, paste with nothing/container selected, paste onto a convertible card)
- [ ] Image downsizing pipeline produces a base64 data URI
- [ ] Link card creation (paste URL, slurp from typed text) — mock via `e2e/fixtures/linkMetadata.ts`
- [ ] Link metadata retry/timeout path — mock a slow/failing response via `e2e/fixtures/linkMetadata.ts`
- [ ] Kind conversion resets `size` to `regular`; discards stale `image`/`link` data

### Connections (spec §4.6) — Stage 6
- [ ] Connector affordance appears on hover, generous hit area
- [ ] At most one edge per pair; a second attempt selects the existing edge
- [ ] Direction toggle (none/forward/backward) via selection menu
- [ ] Edge path leaves/arrives perpendicular to the chosen side

### Clipboard & shortcuts (spec §7, §4.2) — Stage 7
Specs written in `e2e/clipboard.spec.ts` against Stage 7's actual behavior
(in-app clipboard, OS-clipboard plain-text paste via
`e2e/fixtures/clipboard.ts`'s `dispatchPaste`, ⌘/Ctrl+N/D/Z/Backspace,
help panel), but **not run to a passing result** — same environment
limitation noted under Stage 4/5 above; re-confirmed directly this stage
(`ws://host.docker.internal:3322/` connects, `page.goto` to this
container's `--host`-bound address from that remote browser times out).
Run `pnpm e2e` for real before checking any of these off.
- [ ] In-app clipboard copy/paste with staircase offset on repeated paste — mock via `e2e/fixtures/clipboard.ts`
- [ ] Paste always lands outside every container
- [ ] Paste outside viewport pans (without zoom change) into view
- [ ] OS-clipboard priority order: image → URL-only text → in-app clipboard → plain text
- [ ] Every keyboard shortcut in spec §4.2's table
- [ ] Help panel open/close (`?`, Escape); no bare-key zoom-reset shortcut

### Task layer & view modes (spec §6) — Stage 8
- [ ] Task toggle idempotent on re-toggle
- [ ] Status cycling only via selection menu
- [ ] Standard / Task / Recency view mode rendering rules
- [ ] Recency mode re-evaluates periodically while active (wall-clock-driven)
- [ ] `done` styling (strikethrough/dim text, theme-tinted image overlay)

### Error handling, a11y, touch (spec §9, §11, §12) — Stage 9
- [ ] Import-failure UI (modal/toast, not `window.alert`)
- [ ] Corrupt-save recovery UI (visible notification, no autosave-over until acknowledged)
- [ ] Baseline a11y smoke checks (focus states, alt text, `prefers-reduced-motion`)
- [ ] Basic touch-drag for move/select

## Visual-regression tier (phase 3 tooling §3) — Stage 10

Each scenario: seed the same board state via `e2e/fixtures/board.ts` on
both servers, screenshot via `page.screenshot()`, diff via
`e2e/visual/diff.ts` at `threshold: 0.2` / `maxDiffPixelRatio: 0.01`
(tighten per-scenario where an exact match is expected).

- [ ] Default seed board, standard view, light theme
- [ ] Default seed board, standard view, dark theme
- [ ] Each card kind (text regular, text big, image, link) in isolation
- [ ] Each container pattern (none, diagonal, graph-paper, wiggle, plus, jupiter, topography, yyy, corkscrew)
- [ ] Task view with a mix of statuses
- [ ] Recency view across all 4 thresholds
- [ ] `done` styling (struck-through text, tinted image overlay)
- [ ] Help panel open
- [ ] Selection menu anchored to a mixed selection
