# kanvy — prototype-migration phase 5: implementation plan

## Status of this document

Deliverable for prototype-migration phase 5 of
`ctx/prompt/260915-migration-process.md` ("agent writes implementation
plan"). Synthesizes `ctx/notes/260915-kanvy-spec.md` (phase 1),
`ctx/notes/260915-prototype-migration-phase2-schema.md` (phase 2), and
`ctx/notes/260915-prototype-migration-phase3-tooling.md` (phase 3) into a
sequenced plan for phase 6 (test suite) and phase 7 (implementation). This
document does not write code or tests itself — per the migration process,
that's phase 6/7. It also does not revisit any decision already made in
phases 1–3; where this plan makes a new call (mainly file/module
organization, explicitly deferred to phase 5 by phase 3 §2/§7), it says so.

No implementation work should start from this document alone — phase 6
(test suite) is the next step per the process, and phase 7 executes against
both this plan and that suite.

## 1. Starting state

The repo root currently has no `package.json`, build tooling, or app code —
only `ctx/` and `AGENTS.md`. Everything in §2 ("Milestone 0") is scaffolding
that phase 3 assigned to phase 4 (`ctx/notes/260915-prototype-migration-phase3-tooling.md`
§1, §7) but that has not yet produced repo state (no `package.json` to
install `fallow` into, no config files). This plan treats that scaffolding
as its first milestone rather than assuming it pre-exists, so phase 7 has a
concrete starting point. If phase 4 work happens separately before phase 7
begins, Milestone 0 below is simply already done — nothing here changes.

**Update (post-write):** Milestone 0 has since been completed directly in
this repo — see `AGENTS.md`'s "Where this repo is right now" for current
state. `package.json`, TypeScript, Vite, Tailwind v4, Biome, Vitest,
Playwright, and `fallow` (incl. `fallow agent install`) are all set up, and
a bare booting app shell exists at `src/App.tsx`. Stages 1–10 in §4 below
have not started.

## 2. Milestone 0 — repo scaffold

Order matters here (each step assumes the previous one's config exists):

1. `pnpm init`, React 19 + Vite (matching prototype versions), TypeScript
   with full `strict: true` + `noUncheckedIndexedAccess` +
   `exactOptionalPropertyTypes` (phase 3 §4/Q14).
2. Tailwind v4, CSS-first `@theme` config (phase 3 §4/Q16).
3. Biome: `recommended` + `complexity.noExcessiveCognitiveComplexity`
   (default threshold 15), formatter set to 2-space indent (phase 3 §2).
4. Vitest + Playwright installed; empty config files only (no tests yet —
   that's phase 6).
5. `npx fallow agent install` (phase 3 §1) — generates/merges the AGENTS.md
   task-map section, CLAUDE.md import, MCP server, agent skill, commit/push
   gate. Merge into the existing `AGENTS.md`, do not overwrite it.
6. `.fallowrc.jsonc` at repo root: complexity/duplication/circular-dependency/
   unused-code checks at `error` severity (phase 3 §1). `ctx/` is excluded
   via `ignorePatterns` — it's process/reference material, not app code.
7. `zod`, `jotai`, `nanoid`, `clsx`, `lucide-react`, `hero-patterns` as
   dependencies (phase 3 §4).
8. CI workflow (or equivalent) wiring: `biome check`, `tsc --noEmit`,
   `vitest run --coverage`, `fallow` — all `error`/failing-exit-code gates,
   per phase 3 §1/§3. Playwright e2e/visual-regression tiers run in CI too,
   but are only meaningfully populated once phase 6 exists.
9. Update `AGENTS.md`'s "where this repo is right now" section once this
   milestone lands, per the pattern already established in phase 3's
   deliverable.

Known, expected-until-later-stages state right after Milestone 0: `pnpm
test`/`pnpm e2e` fail with "no test files found" (no suite yet — phase 6),
and `fallow audit` flags the phase-3-decided dependencies
(`zod`/`jotai`/`nanoid`/`clsx`/`lucide-react`/`hero-patterns`, `pixelmatch`)
as unused, since nothing consumes them yet. Neither is a regression to fix
now — both resolve naturally once phase 6/7 add real usage.

## 3. Module organization (new — phase 5 call)

Phase 3 explicitly deferred "file-organization conventions beyond
circular-dependency detection" to this phase (§2/§7), motivated directly by
the spec's complaint about the prototype's bloated files (`Board.jsx`,
1217 lines; `useBoard.js`, 450 lines — confirmed via `wc -l` against
`ctx/support/260915-prototype-source/`). Proposed `src/` layout:

```
src/
  schema/            # Zod schemas + z.infer<> types (single source of truth)
    node.ts          # NodeBase, CardNode (discriminated union), ContainerNode
    edge.ts
    board.ts         # Board, version, images map
    legacy.ts        # normalize/backfill for pre-version documents
  state/
    atoms/
      nodes.ts        # atomFamily<NodeId, Node>
      edges.ts        # atomFamily<EdgeId, Edge>
      images.ts
      selection.ts
      viewMode.ts
      theme.ts
    history/          # undo/redo stack, coalescing window, depth constant
    persistence/       # localStorage load/save, corrupt-data recovery, import/export
  geometry/            # pure functions — grid/snap math, anchor points, side selection,
                        # curve generation, bounding boxes, overlap/containment tests
  colors/              # ColorKey/task-status/recency palette resolution (pure)
  cards/               # per-kind behavior: kind-conversion rules, URL-slurp detection,
                        # link-metadata fetch + retry/timeout
  containers/          # parentId assignment on drop, descendant traversal, no-fly-zone
  clipboard/           # in-app node clipboard + OS clipboard integration, priority order
  components/
    canvas/            # Board surface, viewport pan/zoom, grid background
    card/               # Card.tsx split by concern (rendering vs. drag vs. edit-in-place)
    container/
    edge/
    toolbar/
    selection-menu/
    help-panel/
  hooks/               # thin React-facing hooks composing the above (replaces useBoard.js's
                        # single 450-line hook with several focused ones)
```

Rationale:
- Mirrors the spec's own section boundaries (§2 data model → `schema/`,
  §4.4 dragging → `geometry/` + `containers/`, §5 card kinds → `cards/`,
  §7 clipboard → `clipboard/`, §8 undo/redo → `state/history/`, §9
  persistence → `state/persistence/`) so a spec section maps directly to
  where its logic lives.
- Every pure-function module called out in spec §13 as a unit-test target
  (`geometry/`, `colors/`, URL-slurp in `cards/`) is isolated from React,
  so phase 6's unit tests don't need component-rendering scaffolding to
  exercise them.
- Splits `Board.jsx`'s responsibilities (viewport, drag/drop, selection,
  marquee, keyboard shortcuts, clipboard, undo/redo wiring — all currently
  one file) across `components/canvas/`, `geometry/`, `clipboard/`,
  `state/history/`, and per-feature hooks, addressing the spec's file-length
  complaint directly rather than relying on `fallow` to catch it after the
  fact.
- `fallow`'s circular-dependency check (phase 3 §1) is the guardrail against
  this split creating cycles (e.g. `containers/` needing `geometry/` needing
  `containers/`) — no manual import-boundary rule is added beyond that, per
  phase 3 §2/Q7.

## 4. Build sequence

Each stage should be reasonably shippable/testable before the next starts,
and later stages depend on earlier ones being correct.

### Stage 1 — schema & persistence foundation
- `schema/` : Zod schemas for `Node`/`CardNode` (discriminated by `kind`)/
  `ContainerNode`/`Edge`/`Board`, matching `ctx/notes/260915-prototype-migration-phase2-schema.md`
  §2 exactly. TS types derived via `z.infer<>` (phase 3 §4/Q13).
- `schema/legacy.ts` : normalize/backfill for documents missing `version` or
  timestamps (spec §2.7, §9) — runs *before* Zod validation, per phase 3
  §4/Q13.
- `state/persistence/` : localStorage load/save; corrupt-data recovery path
  (spec §9 Q12 — fall back to seed board, visibly notify, don't autosave
  over the bad data until acknowledged); JSON import/export with the
  `images`-map-last serialization rule (spec §2.8).
- This stage has no UI — it's the layer phase 6's unit tests exercise first
  and phase 7's later stages build on.

### Stage 2 — state layer (Jotai)
- `state/atoms/` : `atomFamily`-per-entity for nodes and edges (phase 3 §5),
  plus board-level operations (add/delete/reorder) that read/write the
  family without forcing whole-canvas subscriptions.
- `state/history/` : shared undo/redo stack, 400ms coalescing window, 100-step
  depth (spec §8 — values unchanged, made configurable/visible per Q10),
  selection-restore-on-undo fix (spec §8 Q11).
- Wire persistence (Stage 1) to the state layer: autosave on mutation,
  debounced (hand-rolled per phase 3 §4).

### Stage 3 — pure geometry & color logic
- `geometry/` : grid/snap math (X-axis grid snap, Y-axis gutter snap,
  `Y_SNAP_THRESHOLD`/`Y_SNAP_GUTTER`), anchor-point/side selection for
  edges, bezier curve generation with stable id-hashed bow, bounding-box/
  overlap/containment tests re-derived from `parentId` (spec §2.3) rather
  than recomputed spatially, no-fly-zone math (spec §4.4).
- `colors/` : `ColorKey` resolution incl. `gray`'s light/dark split,
  task-status palette, recency palette + threshold evaluation (spec §3,
  §6.3).
- These are the direct targets of phase 6's unit-test suite (spec §13) —
  build them to be trivially testable (no DOM/React dependency) from the
  start.

### Stage 4 — canvas & node rendering
- `components/canvas/` : viewport (pan/zoom incl. wheel-vs-ctrl+wheel
  distinction, zoom-to-fit, dot-grid background), stage for nodes/edges.
- `components/card/`, `components/container/`, `components/edge/` : visual
  parity with the prototype (Tailwind, per phase 3 §4 color-token
  integration), container-beneath-cards z-order via `nodes` array order
  (schema phase 2 §1).
- Stored `height` as source of truth (spec §2.4) — `ResizeObserver`-driven
  update flows into the node atom; fallback estimate only pre-first-render.
- No interactivity yet beyond what's needed to render correctly — this
  stage is where the visual-regression tier (phase 3 §3/Q12) starts being
  meaningful, since it's diffing rendered output against the live prototype.

### Stage 5 — selection, dragging, resizing
- Selection model (spec §4.3): single/additive/marquee, container-body
  marquee-start exclusion rule, multi-select-preserving click.
- Dragging (spec §4.4): grid/gutter snap, no-fly-zone clamping, container
  descendant drag (recursive, ancestor-excluding), multi-selection drag
  merge.
- Resize (8-way handles): containers always, big-text cards only.
- `containers/` : formal `parentId` assignment on drop-by-largest-overlap
  (spec §2.3), recomputed only on drop, not continuously.

### Stage 6 — card-kind behavior & connections
- `cards/` : kind-conversion rules (text↔image↔link, `size` reset to
  `regular` on conversion), URL-slurp detection (live-typing + blur
  triggers, first-URL-only), image downsizing/base64 pipeline, link-metadata
  fetch via microlink.io with timeout + retry (spec §5.4 Q18).
- `components/edge/` + `geometry/` : connector-affordance hover, generous
  hit area, one-edge-per-pair enforcement (select existing instead of
  duplicating), direction toggle via selection menu.

### Stage 7 — clipboard, keyboard shortcuts, toolbar/help
- `clipboard/` : in-app node clipboard (staircase offset repeats, container-
  avoidance push-out, viewport pan-into-view) + OS clipboard integration,
  full priority order from spec §7. Native `paste` event only — no
  programmatic `navigator.clipboard.readText()` (spec §7, explicit
  preservation note).
- All keyboard shortcuts from spec §4.2's table; help panel (`?` button,
  Escape-to-close); no reintroduction of the removed bare-key zoom-reset
  shortcut.
- `components/toolbar/` : zoom controls, zoom-percentage click-to-reset,
  view-mode menu (eye icon).

### Stage 8 — task layer & view modes
- Task toggle (idempotent on re-toggle), status cycling via selection menu
  only, status glyph rendering.
- Standard / Task / Recency view modes (spec §6.2) — recency mode's
  periodic re-evaluation (wall-clock-driven, not just data-driven) needs an
  interval/rAF loop scoped to when that view is active, not global.
- `done` styling: strikethrough/dim text, theme-tinted (not grayscale)
  image overlay.

### Stage 9 — error handling, a11y, touch
- Import-failure UI (modal/toast replacing `window.alert`, spec §9 Q14);
  corrupt-save recovery UI (Stage 1's logic, now with the visible-
  notification UI spec §9 Q12 requires).
- Baseline a11y (spec §11): semantic roles/labels, focus states, contrast,
  alt text, `prefers-reduced-motion` — applied across all components built
  in prior stages, not a separate bolt-on pass per component type.
- Basic touch support (spec §12): touch-drag for move/select at minimum;
  explicitly not full interaction-model parity — stop at "not totally
  unusable," per spec's own scope guard.

### Stage 10 — polish & visual-regression closure
- Run the full Playwright visual-regression tier (phase 3 §3/Q12) across
  all scenarios (each card kind, each container pattern, each view mode,
  light/dark theme) against the live prototype server; close any drift
  found (styling only — not a license to change behavior).
- Final `fallow`/coverage/lint gate pass before calling phase 7 complete.

## 5. Explicit non-goals (carried from spec, not re-litigated)

- No new user-facing features or behavior changes beyond the corrected data
  model (spec §2) and the named UX fixes (recency-agnostic undo-selection
  restore, link-fetch retry, import-failure UI). "Warts, keep" items
  (updatedAt-on-any-touch, fixed undo constants, fixed recency thresholds)
  are ported as-is, not "fixed."
- No multiboard, no JSON-on-disk/`json-server` backend, no JSON Canvas
  format alignment beyond what phase 2 §5 already adopted — these stay
  design sketches per phase 2 §3/§4.
- No component-test tier (phase 1 §13) — e2e + unit only.
- No headless UI primitives library (phase 3 §4/Q15) — hand-rolled per
  existing decision.

## 6. Open items carried into phase 7

- `GRID_SIZE`/`CARD_WIDTH` as plain TS constants is the default (phase 3
  §4) — revisit only if it proves awkward once Stage 4 is underway, per
  phase 3's own framing, not a foregone conclusion to change.
- Biome's cognitive-complexity threshold (15, default) and `fallow`'s
  complexity/duplication thresholds are unset numerically beyond "lean on
  defaults" (phase 3 §1/§2) — tune during Stage 4 onward only if real code
  trips them unreasonably, noting why in the relevant config file's comments
  if changed.
- Exact `fallow`/coverage threshold numbers (phase 3 §7) — phase 6 (test
  suite) is where the 80% starting bar gets a real baseline to check against.

## 7. Next step

Per the migration process, prototype-migration phase 6 ("agent builds test
suite") comes next — using this plan's module boundaries (§3) and the
spec's §13 testing priorities to write the actual unit/e2e/visual-regression
suite before phase 7 implementation begins.
