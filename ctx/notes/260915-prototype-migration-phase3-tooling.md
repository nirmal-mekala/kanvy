# kanvy — prototype-migration phase 3: tooling, config, and stack (deliverable)

## Status of this document

Deliverable for prototype-migration phase 3 of
`ctx/prompt/260915-migration-process.md` ("align on tooling, config, and
stack"). Resolves
`ctx/notes/260915-prototype-migration-phase3-questionnaire.md` into concrete
decisions. Builds on `ctx/notes/260915-kanvy-spec.md` (prototype-migration
phase 1) and `ctx/notes/260915-prototype-migration-phase2-schema.md`
(prototype-migration phase 2), and resolves the item phase 2 §6 flagged as
"a phase 3 style call" (`PatternKey`/`ColorKey` as TS string-literal unions
— see §4 below). Feeds prototype-migration phase 4 (agent readiness) and
`AGENTS.md`, which is updated alongside this doc per questionnaire Q2.

Decisions below are final for phase 3 unless marked **(open)**. Numbers in
parens (e.g. Q1) refer to the corresponding questionnaire item.

---

## 1. Code health — `fallow`

**(confirmed, Q1)** Use [`fallow`](https://docs.fallow.tools) (npm package
`fallow`) as the primary code-health tool, taking advantage of as many of
its features as apply here: complexity/file-size hotspots, duplication,
circular-dependency detection, unused-code detection, and (loosely)
architecture/boundary drift.

- **Config:** `.fallowrc.json` (or `.fallowrc.jsonc`/`fallow.toml`) at repo
  root, first-match-wins per directory — no merge semantics across nested
  configs, so keep a single root config unless a subpackage genuinely needs
  an override.
- **File-length ceiling (Q3):** no hard line-count number set — lean on
  fallow's own complexity/hotspot detection rather than a fixed ceiling.
  Revisit with a concrete number only if fallow's defaults prove too loose
  in practice.
- **Duplication (Q4):** covered by fallow's built-in duplication detection;
  no separate tool (`jscpd` etc.) needed.
- **Circular dependencies (Q7):** fallow's dependency-graph analysis is the
  primary circular-dependency check (Biome's own `noImportCycles` rule is
  `nursery`/unstable as of Sept 2026 and has an open subpath-import bug —
  see §2 — so it's a secondary/optional signal, not relied on).
- **CI gate vs. agent visibility (Q2):** rule severities map directly to
  process exit codes (`error` fails CI, `warn` exits 0, `off` skips) — set
  the checks above to `error` so violations fail CI, per "failing CI is
  nice as well." The bigger ask — the agent knowing it's on track *before*
  CI runs — is handled by fallow's first-class agent integration, not a
  custom script:

  ```
  npx fallow agent install
  ```

  This single command (documented to support Claude Code directly):
  - Generates an **AGENTS.md task map** section (merge with, don't
    overwrite, the hand-authored `AGENTS.md` at repo root).
  - Registers a **CLAUDE.md import** for the fallow context.
  - Installs the **Fallow Agent Skill**, and registers an **MCP server**
    exposing analysis/audit/health/duplication/tracing/fix-preview-and-apply
    tools (each with a CLI fallback for non-MCP contexts).
  - Sets up a commit/push gate.

  Run this during prototype-migration phase 4 (agent readiness) once the
  repo has a `package.json` to install into — noted here as the phase 3
  tooling decision, executed in phase 4.

## 2. Linting & formatting — Biome

**(confirmed, Q5)** Biome replaces `oxlint` (the prototype's current
linter) for both **linting and formatting** — no separate Prettier config.

- **Indentation:** 2 spaces, not Biome's default tab indentation —
  `"formatter": { "indentStyle": "space", "indentWidth": 2 }` in
  `biome.json`.
- **Rule set (Q6):** Biome's `recommended` preset, plus one explicit
  opt-in: `complexity.noExcessiveCognitiveComplexity` (not in `recommended`
  by default). Keep its default threshold (`maxAllowedComplexity: 15`,
  SonarSource's Cognitive Complexity algorithm) unless it proves too
  strict against real code during phase 7 implementation, in which case
  raise it deliberately (and note why) rather than silently disabling it.

  ```json
  {
    "linter": {
      "rules": {
        "recommended": true,
        "complexity": {
          "noExcessiveCognitiveComplexity": "error"
        }
      }
    }
  }
  ```

- No rules identified yet that need to be explicitly turned off to avoid
  fighting the discriminated-union/Jotai patterns this migration adopts —
  revisit if one surfaces during phase 7.
- **Import boundaries (Q7):** no additional structural/import-boundary
  linting beyond circular-dependency detection (owned by `fallow`, per §1)
  — file-organization conventions beyond that are a phase 5
  implementation-plan concern, not a phase 3 tooling one.
- **Biome's own `noImportCycles`** (nursery, `warn` by default, requires
  Biome's project-scanner, ignores type-only imports, has an open bug with
  subpath imports as of late 2026) may optionally be enabled later as a
  fast in-editor signal, but `fallow` is the source of truth for this
  check, not Biome.

## 3. Testing frameworks

**(confirmed)** Per Q8/Q9, using the split already settled in
prototype-migration phase 1 §13 (e2e primary for canvas/pointer behavior,
unit tests for pure functions, no dedicated component tier):

- **Unit test runner:** Vitest (Q8) — pairs with Vite, already the build
  tool.
- **E2e framework:** Playwright (Q9) — also used for the visual-diffing
  tier below. Clipboard/paste APIs continue to be mocked per phase 1 §17,
  not driven through real browser permission grants.
- **Type-checking (Q10):** `tsc --noEmit` runs in the same CI gate as
  tests/lint — a type error fails CI, same as a lint or test failure.
- **Coverage (Q11):** a moderately high threshold, gated in CI, scoped to
  the pure-function modules identified in spec §13 (grid/snap math,
  geometry, URL-slurp detection, color/pattern/task-status resolution) —
  **80% line coverage** on those modules as the starting bar. Not applied
  blanket-wide to UI/component code, where e2e is the primary correctness
  signal per phase 1's testing split. Revisit the number once the test
  suite exists (phase 6) and an actual baseline is visible.
- **Visual regression against the original prototype (Q12):** a dedicated
  Playwright test tier, separate from the interaction-behavior e2e suite,
  that diffs the new app's rendering against the **original prototype
  running live**, not a committed baseline-PNG snapshot:
  - The original prototype is already vendored, frozen, under
    `ctx/support/260915-prototype-source/` — run it via its own `vite dev`
    on a fixed port as the reference server; run the new app on another
    port. Both are real, running apps for the duration of this test tier.
  - Per scenario (e.g. "default board, standard view," "task view with a
    mix of statuses," "recency view," each card kind, each container
    pattern, light and dark theme): open a Playwright page/context against
    each server, drive both to the same state, and capture a screenshot
    `Buffer` from each via `page.screenshot()`.
  - Diff the two buffers directly with `pixelmatch` (the library
    Playwright's own `toHaveScreenshot()` uses internally) rather than
    Playwright's baseline-file assertion, since there's no static baseline
    here — the "baseline" is the live original app, not a checked-in file.
  - Starting thresholds: `threshold: 0.2` (Playwright/pixelmatch's default
    YIQ perceptual-distance tolerance per pixel) with
    `maxDiffPixelRatio: 0.01` (1% of pixels may differ) as the pass/fail
    bar — loose enough to tolerate font-rasterization/anti-aliasing noise
    between the two apps, tight enough to catch a real layout/spacing/color
    regression. Tighten per-scenario if a specific check needs to be exact
    (e.g. `threshold: 0`, `maxDiffPixels: 0` for a solid-color swatch
    comparison).
  - Because the original prototype is vendored and not expected to change,
    this reference server is stable across the whole rewrite — no
    baseline-rot problem the way committed-PNG visual tests usually have.

## 4. FE libraries & build stack

- **Zod (Q13, confirmed):** Zod schemas are the single source of truth for
  the v0 data model — TS types are derived via `z.infer<>` rather than
  hand-written types kept in sync manually. This supersedes the plain TS
  interfaces sketched in `ctx/notes/260915-prototype-migration-phase2-schema.md`
  §2 and `ctx/support/260915-kanvy-schema.json` (both remain valid as the
  *shape* reference; the Zod schema becomes the actual implementation
  artifact in phase 7). Zod validates at **board load** and **JSON import**
  — both paths that read a document from outside the running app's own
  in-memory state. It does not replace the "normalize/backfill legacy
  documents" leniency called for in spec §2.7/§9 — that backfill logic
  runs *before* Zod validation, so a pre-version prototype document is
  normalized into v0 shape first, then validated, rather than rejected
  outright.
- **TypeScript strictness (Q14, confirmed):** full `strict: true` plus the
  stricter opt-ins — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  and equivalents — not baseline `strict` alone.
- **UI component primitives (Q15, confirmed):** none — stay fully
  hand-rolled (no Radix/Headless UI), matching the developer's read that
  the UI surface (help panel, selection menu, color/pattern pickers) is
  small and simple enough that a primitives library would be net
  abstraction overhead rather than a win. `lucide-react` stays for icons,
  per "preserve icons."
- **Tailwind (Q16):**
  - **Version:** Tailwind v4 (CSS-first `@theme` config), matching the
    prototype's already-current React 19/Vite versions.
  - **Color palette — deep Tailwind integration (confirmed):** the Nord-
    derived `ColorKey` palette (spec §3: `gray`/`coral`/`orange`/`amber`/
    `lime`/`teal`/`sky`/`violet`/`pink`), the 4-color task-status palette,
    and the 4-color recency palette all become Tailwind theme tokens via
    `@theme` (e.g. `--color-gray`, `--color-coral`, …, with light/dark
    variants where the palette requires it — `gray` uniquely has distinct
    light/dark hexes per spec §3). This resolves the phase 2 §6 open item
    for `ColorKey` as a concrete implementation: it's a Tailwind theme
    token set, and the TS-level `ColorKey` string-literal union (derived
    from the same Zod enum, per the point above) stays the type-level
    mirror of those token names.
  - **Geometry constants (`GRID_SIZE`, `CARD_WIDTH`) — (open, low
    priority):** developer is ambivalent; default to keeping these as
    plain TS constants (not Tailwind theme tokens), consumed directly by
    layout code and Tailwind arbitrary-value utilities where needed (e.g.
    `w-[var(--card-width)]`), since they're geometry/snapping math inputs
    first and styling tokens only incidentally. Revisit in phase 5/7 if
    this becomes awkward in practice.
  - **`PatternKey`:** stays a Zod-enum-derived TS string-literal union (not
    a Tailwind concern) — the `hero-patterns` SVG patterns aren't
    expressible as Tailwind theme tokens; this fully resolves phase 2 §6's
    open item.
- **ID generation (confirmed, post-questionnaire):** `nanoid` for node/edge/
  image ids, replacing whatever ad hoc id scheme the prototype uses today.
- **Conditional class composition (confirmed, post-questionnaire):** `clsx`
  for composing Tailwind classes across view-mode/task-status/recency-color
  branching (genuinely branchy per §4's color-token integration above) —
  not `tailwind-merge`, since this app has no user-supplied/override class
  strings to reconcile, just internal conditional composition.
- **Debouncing:** stays hand-rolled (no `use-debounce`/lodash dependency) —
  the "debouncing hygiene" improvement area from the spec is addressed by
  writing it correctly and consistently in-house, not by adding a library.
- **Package manager & repo shape (Q17, confirmed):** pnpm (not npm, despite
  the prototype's existing `package-lock.json`). Single-package repo, no
  monorepo/workspace split — the future JSON-on-disk + `json-server`
  backend sketched in phase 2 §4 stays intentionally light (a JSON file
  plus a thin CLI/static server, per phase 2 §4's already-light framing),
  not substantial enough to warrant its own workspace package.

## 5. State management — Jotai conventions (Q18, confirmed)

Granular per-entity atoms: an `atomFamily` keyed by node id (and similarly
for edges), rather than one coarse atom per top-level board slice
(`nodesAtom`/`edgesAtom`/`imagesAtom` holding whole arrays). This directly
targets the migration prompt's stated re-rendering problem — the prototype
re-renders the whole canvas on a single-node drag — by scoping subscription
to the entity actually changing. Exact wiring (how board-level operations
like "add node"/"delete node" interact with an `atomFamily`, how selection
state composes with it) is left to the prototype-migration phase 5
implementation plan, not fixed further here.

## 6. Summary — stack at a glance

| Concern | Choice |
|---|---|
| Language | TypeScript, full `strict` + stricter opts |
| UI | React 19 (unchanged from prototype) |
| Build tool | Vite (unchanged from prototype) |
| Styling | Tailwind v4, `@theme`-based color tokens |
| State | Jotai, `atomFamily`-granular |
| Validation | Zod (source of truth for types, board-load + import validation) |
| Linting/formatting | Biome (`recommended` + `noExcessiveCognitiveComplexity`) |
| Code health | `fallow` (complexity, duplication, circular deps, unused code) |
| Unit tests | Vitest |
| E2e tests | Playwright (Clipboard mocked) |
| Visual regression | Playwright + raw `pixelmatch`, live original-prototype server as baseline |
| Type-check gate | `tsc --noEmit`, CI-blocking |
| Coverage gate | ~80% line coverage on pure-function modules, CI-blocking |
| Package manager | pnpm, single-package repo |
| Icons | `lucide-react` (unchanged from prototype) |
| IDs | `nanoid` |
| Conditional classes | `clsx` |
| Debouncing | hand-rolled, no library |

## 7. Explicitly deferred beyond phase 3

- Exact `fallow`/coverage thresholds once real code exists to tune against
  — phase 6/7.
- File-organization/import-boundary conventions beyond circular-dependency
  detection — phase 5 implementation plan.
- `Jotai` atom wiring details beyond "granular `atomFamily`" — phase 5.
- Whether `GRID_SIZE`/`CARD_WIDTH` ever move into Tailwind theme tokens —
  revisit only if the plain-TS-constant approach proves awkward.
- Running `npx fallow agent install` itself — phase 4 (agent readiness),
  once a `package.json` exists to install into.
