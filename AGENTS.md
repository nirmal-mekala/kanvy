# AGENTS.md

## Where this repo is right now

`kanvy` has completed **prototype-migration phase 7** (implementation) of
the process defined in `ctx/prompt/260915-migration-process.md` — all 10
build stages from `ctx/notes/260915-prototype-migration-phase5-implementation-plan.md`
§4 are implemented: schema/persistence (Zod, localStorage, legacy-document
normalization), Jotai state/history (undo/redo, selection-restore),
canvas/node rendering (Tailwind theme, pan/zoom, dot-grid), selection/
drag/resize + formal container ownership, card-kind conversion + link
metadata fetch/retry + edge connections, clipboard/shortcuts/toolbar/help,
task layer + view modes (Standard/Task/Recency) via a new
`components/selection-menu/`, and a baseline error-handling/a11y/touch
pass (import-failure banner, corrupt-save recovery notification, alt
text/focus-visible/`prefers-reduced-motion`, touch-action tuning).

**Verified, as of this writing (all re-run fresh, not assumed):**
- `pnpm test` — 185/185 passing.
- `pnpm typecheck` / `pnpm build` — clean.
- `pnpm lint` — clean (a handful of pre-existing warnings only: one
  `noNonNullAssertion` in the Vite-generated `main.tsx`, a few CSS
  `noDescendingSpecificity` notices — none are errors).
- `npx fallow audit --format json --quiet --gate-marker agent` — verdict
  `pass`, zero newly-introduced dead-code/complexity/duplication findings.
- **`pnpm e2e` — 48/48 passing, against a real browser**, via the
  `playwright-remote-browser` skill (a Playwright server on the developer's
  host Mac, connected from this container over
  `ws://host.docker.internal:3322/`). The dev server previously used the
  default port 5173, which the host couldn't route back to; the developer
  confirmed ports 1993–1997 are published from this container, and
  pointing the dev server (`KANVY_E2E_PORT`) and the remote browser
  (`KANVY_E2E_HOST=localhost`) at one of those unblocked the whole run —
  the earlier "no published port" note below was accurate for 5173, just
  not for every port.
  `ctx/notes/260915-phase6-e2e-test-scenario-checklist.md` now reflects
  real, passing runs per scenario. This first real run found and fixed
  four genuine bugs static review had missed:
  - The color/big-text/convert-to-task **selection menu**, the **zoom
    controls**, the **help button**, and the **edge direction-toggle
    control** all silently did nothing when clicked — each sits inside
    `.board`'s own `pointerdown`-handling root, and none of them stopped
    propagation, so the click either hijacked the board's pointer capture
    or got treated as a canvas-level marquee/deselect gesture before the
    button's own `click` could fire.
  - Clicking a **card's caption text** (almost the entire visible card
    surface) failed to select it at all — `CardBody.tsx`'s textarea called
    `stopPropagation()` on `pointerdown`, blocking the click from ever
    reaching `Card.tsx`'s selection handler. Fixed by porting the
    prototype's actual `.no-drag` pattern: selection always fires; only
    *drag start* is skipped for interactive children.
  - The very **first in-app paste** landed with zero offset, exactly on
    top of the original (`nodeClipboard.ts` computed the staircase offset
    before incrementing `pasteCount`, not after, unlike the prototype).
  - Every card's **`updatedAt` got silently refreshed to "now" on first
    render**, because the height-measurement sync (`ResizeObserver` →
    `onHeightChange`) was routed through the same atom used for real user
    edits, which always bumps `updatedAt` — defeating recency mode almost
    entirely. Fixed with a dedicated `setNodeHeightAtom` that doesn't.

**Still NOT verified:** the **visual-regression tier**
(`e2e/visual/scenarios.spec.ts`, diffing against the live prototype) needs
a second dev server (the vendored prototype under
`ctx/support/260915-prototype-source/`) and its own port-forwarding setup
(`pnpm e2e:visual:setup` then `pnpm e2e:visual`) — not yet attempted with
the working remote-browser setup above. Pixel-parity with the prototype
remains unconfirmed by anything beyond static review; do this before
treating phase 7 as fully closed.

Before making any change, check `ctx/prompt/260915-migration-process.md` for
which prototype-migration phase is currently active, and re-read this file —
it will be updated as the stack, tooling, and structure are established in
later phases.

## The `ctx` directory

`ctx/` holds process artifacts for this migration and is the primary source
of context for agents working in this repo. It has three subdirectories:

- `ctx/notes/` — human- or agent-authored markdown documentation, findings,
  and specs. Agents may create and edit files here.
- `ctx/prompt/` — prompts describing the process/approach. Treat as
  directives from the developer; don't edit without being asked.
- `ctx/support/` — supporting material: the prototype's full source
  (`260915-prototype-source/`), the JSON Canvas spec used as inspiration,
  distilled prompt history from building the prototype, and the developer's
  own natural-language description of the app.

All markdown files in `ctx/` follow `YYMMDD-<title>.md`, dated by creation
date (e.g. `260427-pdf-render.md`), never last-edited date.

**Read before starting any implementation work:**
- `ctx/notes/260915-kanvy-spec.md` — the v0 spec. This is the authoritative
  description of what the app should do and how its data model should be
  shaped. It supersedes the prototype source wherever the two disagree (the
  spec documents exactly where and why).
- `ctx/notes/260915-prototype-migration-phase1-questionnaire.md` — the
  developer decisions the spec is built on. Useful for the *reasoning*
  behind a spec decision when the spec's summary isn't enough context to
  extend it correctly.
- `ctx/notes/260915-prototype-migration-phase2-schema.md` — the resolved v0
  schema shape (node/edge collection shape, taxonomy) referenced by the spec
  and by `ctx/support/260915-kanvy-schema.json`.
- `ctx/notes/260915-prototype-migration-phase3-tooling.md` — the concrete
  stack decisions summarized below (§Stack) — read this one directly if a
  config file's *why* isn't obvious from the config itself.
- `ctx/support/260915-prototype-source/` — the original prototype. Treat its
  *behavior* as a reference implementation to match (pixel-perfect styling,
  same interactions), but not its architecture — it is plain JS with thin
  ad hoc state management, no tests, and no type safety, all of which this
  migration is explicitly improving on. Do not copy its code wholesale;
  reimplement its behavior per the spec.

## Working conventions

- This migration explicitly preserves prototype *functionality* — "warts and
  all" — while improving architecture (TypeScript, Tailwind, Jotai, tests,
  linting, file organization, error handling, baseline a11y). Do not add new
  user-facing features or change behavior beyond what the spec calls out as
  a corrected data-model issue. If a change looks like it would alter
  behavior beyond the spec, stop and ask rather than proceeding.
- Do not resolve a "TODO" comment or remove it unless explicitly asked to.
- If asked to investigate something, report findings and stop — do not
  proceed to fix what you found without being told to.
- The corrected v0 data model (see spec §2) introduces real changes to the
  prototype's shape (discriminated card kinds, formal container ownership,
  stored card height, schema versioning). These are intentional and
  in-scope; everything else about the data model that isn't called out as
  corrected should be treated as the target shape for the new schema once
  phase 2 (schema alignment) concludes.

## Stack (resolved in prototype-migration phase 3)

Full rationale: `ctx/notes/260915-prototype-migration-phase3-tooling.md`.

- Language: TypeScript, full `strict: true` plus stricter opt-ins
  (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, …).
- UI: React 19 (unchanged from prototype), `lucide-react` for icons
  (unchanged from prototype), no headless UI component library — hand-rolled
  to match the prototype. `nanoid` for id generation; `clsx` for conditional
  Tailwind class composition. Debouncing stays hand-rolled — no
  `use-debounce`/lodash dependency.
- Styling: Tailwind v4 (CSS-first `@theme` config). Pixel-perfect parity
  with the prototype is the goal; if achieving that requires fighting
  Tailwind excessively, pause and raise it rather than hacking around it.
  The Nord-derived color palette, task-status palette, and recency palette
  are Tailwind theme tokens; `GRID_SIZE`/`CARD_WIDTH` stay plain TS
  constants, not theme tokens.
- State management: Jotai, granular `atomFamily`-per-entity (not one atom
  per board slice) — targets the whole-canvas-re-renders-on-one-drag problem
  directly.
- Validation: Zod — source of truth for the v0 data model; TS types are
  derived via `z.infer<>`. Validates at board load and JSON import (after
  legacy-document normalization/backfill, not instead of it).
- Testing: Vitest for unit tests (pure functions only, per spec §13);
  Playwright for e2e (canvas/pointer-driven interactions, primary test
  layer; Clipboard APIs mocked, not real browser permission grants) and for
  a separate visual-regression tier that diffs the new app against the
  *original prototype running live* (not committed baseline PNGs). `tsc
  --noEmit` and a ~80% coverage floor on pure-function modules both fail
  CI, same as lint/tests.
- Linting/formatting: Biome (`recommended` + explicit
  `complexity.noExcessiveCognitiveComplexity` opt-in), also owns formatting
  — no separate Prettier config. 2-space indentation (Biome's default is
  tabs — overridden).
- Code health: `fallow` — complexity/duplication/circular-dependency/
  unused-code checks, CI-blocking (`error` severity). Also the primary
  circular-dependency check (not Biome's `noImportCycles`, which is
  `nursery`/unstable). Agent integration is set up (`npx fallow agent
  install` — see the task map below), so status/health checks are available
  directly rather than only surfacing as a CI failure after the fact. `ctx/`
  is excluded from analysis (`.fallowrc.jsonc`'s `ignorePatterns`) — it's
  process/reference material, not app code.
- Package manager: pnpm. Single-package repo — no monorepo/workspace split;
  the future JSON-on-disk + `json-server` backend (phase 2 §4) stays
  light enough not to need one.

This section records decisions, not the literal config contents — check
`biome.json`/`.fallowrc.jsonc`/`vitest.config.ts`/`playwright.config.ts`
themselves, now that they exist at the repo root, for exact rule sets and
thresholds.

---

<!-- fallow:setup-hooks:start -->
## Fallow local gate

Before any `git commit` or `git push`, run `fallow audit --format json --quiet --explain --gate-marker agent`. If the verdict is `fail`, fix the reported findings before retrying. Treat JSON runtime errors like `{ "error": true, ... }` as non-blocking.

Audit defaults to `gate=new-only`: only findings introduced by the current changeset affect the verdict. Inherited findings on touched files are reported under `attribution` and annotated with `introduced: false`, but do not block the commit. Set `[audit] gate = "all"` in `fallow.toml` to gate every finding in changed files.

For non-skill agents, treat the task map below as the local onboarding source: run the listed fallow command before destructive edits, before commits, and before pull request handoff.

## Fallow task map

| When the agent is about to... | Run |
|---|---|
| delete an "unused" export or file | `fallow dead-code --trace <file>:<export>` |
| prove a TypeScript symbol's exact consumers before refactoring | `fallow dead-code --type-aware --symbol-impact <file>:<export-or-class.method>` |
| find how one module reaches another | `fallow trace --path <from> <to>` (Reports `reachable: false` instead of failing when no import path exists; type-only hops are reported, not skipped.) |
| delete an "unused" dependency | `fallow dead-code --trace-dependency <name>` |
| commit or open a PR | `fallow audit --base <ref>` |
| read a diff before approving it | `fallow review --base <ref> --brief` (orientation, never gates: deterministic and always exit 0, unlike the audit row) |
| prioritize refactoring | `fallow health --hotspots --targets` |
| ask who owns code | `fallow health --ownership` |
| check untested-but-reachable code | `fallow health --coverage-gaps` |
| consolidate duplication | `fallow dupes --trace dup:<fingerprint>` |
| find feature flags | `fallow flags` |
| check which architecture rules apply to a file before changing it | `fallow guard <files>` |
| surface security candidates | `fallow security` |
| understand a finding | `fallow explain <issue-type>` |
| scope a monorepo | `--workspace <glob> / --changed-workspaces <ref>` (global flags, prefix any command) |
<!-- fallow:setup-hooks:end -->
