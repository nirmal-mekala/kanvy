# AGENTS.md

## Where this repo is right now

This repo currently contains no application code. `kanvy` is being migrated
from a working JavaScript/React prototype (kept for reference, not built or
run from this repo — see below) into a new TypeScript implementation. As of
this writing, the migration is at the end of **phase 1** (documentation) of
the process defined in `ctx/prompt/260915-migration-process.md`. There is no
`package.json`, build tool, test runner, or lint config at the repo root yet
— those are decided in phase 3 and set up in phase 4.

Before making any change, check `ctx/prompt/260915-migration-process.md` for
which phase is currently active, and re-read this file — it will be updated
as the stack, tooling, and structure are established in later phases.

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
- `ctx/notes/260915-phase1-questionnaire.md` — the developer decisions the
  spec is built on. Useful for the *reasoning* behind a spec decision when
  the spec's summary isn't enough context to extend it correctly.
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

## Stack (to be filled in during phase 3)

- Language: TypeScript
- UI: React
- Styling: Tailwind (pixel-perfect parity with the prototype is the goal;
  if achieving that requires fighting Tailwind excessively, pause and raise
  it rather than hacking around it)
- State management: Jotai
- Testing: e2e-first for canvas/pointer-driven interactions, unit tests for
  pure functions (geometry, snapping, color/pattern resolution, link-slurp
  detection); see spec §13. Specific frameworks TBD in phase 3.
- Linting/code health: strict Biome config (linting) + a strict/maximalist
  code-health config; specifics TBD in phase 3.

This section will be updated with concrete package/config names once phase 3
concludes — until then, do not assume a specific test runner or lint tool
without checking for a config file first.
