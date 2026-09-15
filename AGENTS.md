# AGENTS.md

## Where this repo is right now

This repo currently contains no application code. `kanvy` is being migrated
from a working JavaScript/React prototype (kept for reference, not built or
run from this repo — see below) into a new TypeScript implementation. As of
this writing, the prototype-migration is at the end of **prototype-migration
phase 3** (tooling/config/stack alignment) of the process defined in
`ctx/prompt/260915-migration-process.md`. There is no `package.json`, build
tool, test runner, or lint config at the repo root yet — the stack is now
decided (see below) but not yet set up; that happens in prototype-migration
phase 4.

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
  `nursery`/unstable). Set up agent integration via `npx fallow agent
  install` during prototype-migration phase 4 — this generates an AGENTS.md
  task-map section (merge into this file, don't overwrite it), a CLAUDE.md
  import, an MCP server, and an agent skill, so status/health checks are
  available to an agent directly rather than only surfacing as a CI
  failure after the fact.
- Package manager: pnpm. Single-package repo — no monorepo/workspace split;
  the future JSON-on-disk + `json-server` backend (phase 2 §4) stays
  light enough not to need one.

Do not assume a specific config's exact contents without checking the file
itself once it exists (this section records decisions, not the literal
`biome.json`/`.fallowrc.json`/`vitest.config.ts` contents) — those are set
up in prototype-migration phase 4.
