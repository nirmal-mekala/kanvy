# AGENTS.md

## Where this repo is right now

`kanvy` is a completed migration (prototype-migration phases 1-7, see
`ctx/prompt/260915-migration-process.md`) from a plain-JS prototype to a
typed React/Jotai/Zod stack — preserving prototype behavior while
improving architecture (TypeScript, tests, linting, file organization,
baseline a11y). Before making any change, check that prompt file for the
current phase, and re-read this file.

Two schema revisions since the initial migration (see spec §2.3):
- **v0.1**: container membership reverted from a formal `parentId` field
  to purely spatial (derived fresh from x/y/w/h, never stored) — see
  `ctx/notes/260916-v0.1-spatial-containers.md` for the rationale.
- Drag-carry requires a node to be *completely within* the dragged
  container, not merely overlapping it.

Multi-board support (spec §14's deferred "Multiboard support" item) is
implemented: the schema v3 shape (`boards` collection, `boardId`-scoped
shared `nodes`/`edges`, a `board` card kind) and TanStack Router-based
home-board navigation are in place — see
`ctx/notes/260917-multiboard-support-design.md` for the design rationale.

The undo stack is still whole-`Board`-snapshot, and node/edge delete is
still hard removal (only boards are tombstoned) — moving both to an
action-based ops model with tombstoning for all entity kinds, plus
introducing TanStack Query as the mutation layer, is designed but not yet
implemented: see `ctx/notes/260921-action-based-undo-and-tombstoning.md`.

Do not use this file to track test/build pass counts or a changelog of
fixed bugs — that state goes stale immediately and belongs in test output
and git history, not here.

## The `ctx` directory

`ctx/` holds process artifacts for this migration and is the primary
source of context for agents working in this repo:

- `ctx/notes/` — human- or agent-authored docs, findings, specs. Agents
  may create/edit files here.
- `ctx/prompt/` — process/approach prompts. Treat as developer directives;
  don't edit without being asked.
- `ctx/support/` — the prototype's full source, the JSON Canvas spec used
  as inspiration, and distilled prompt history.

Markdown files in `ctx/` follow `YYMMDD-<title>.md`, dated by creation
date, never last-edited date.

**Read before starting implementation work:**
- `ctx/notes/260915-kanvy-spec.md` — the v0 spec, authoritative for app
  behavior and data model; supersedes the prototype wherever they disagree.
- `ctx/notes/260915-prototype-migration-phase1-questionnaire.md` — the
  developer decisions the spec is built on.
- `ctx/notes/260915-prototype-migration-phase2-schema.md` — the resolved
  schema shape.
- `ctx/notes/260915-prototype-migration-phase3-tooling.md` — stack
  decisions (§Stack below is a summary; read this for the *why*).
- `ctx/support/260915-prototype-source/` — the original prototype. Match
  its *behavior* (pixel-perfect styling, same interactions), not its
  architecture (plain JS, no tests, no type safety). Reimplement per the
  spec rather than copying code wholesale.

## Working conventions

- Preserve prototype *functionality* — "warts and all" — while improving
  architecture. Do not add new user-facing features or change behavior
  beyond what the spec calls out as a corrected data-model issue. If a
  change looks like it would alter behavior beyond the spec, stop and ask.
- Do not resolve or remove a "TODO" comment unless explicitly asked to.
- If asked to investigate something, report findings and stop — do not
  proceed to fix it without being told to.
- The corrected v0 data model (spec §2) introduces intentional changes to
  the prototype's shape (discriminated card kinds, stored card height,
  schema versioning, and the two revisions noted above). Everything else
  not called out as corrected should be treated as the target shape for
  the new schema.

## Stack (resolved in prototype-migration phase 3)

Full rationale: `ctx/notes/260915-prototype-migration-phase3-tooling.md`.

- **Language**: TypeScript, full `strict: true` plus stricter opt-ins
  (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, …).
- **UI**: React 19, `lucide-react` icons, no headless UI library
  (hand-rolled to match the prototype). `nanoid` for ids. Conditional
  class composition is plain string-joining, not `clsx`. Debouncing is
  hand-rolled, not a library.
- **Styling**: Tailwind v4 (CSS-first `@theme` config). Pixel-perfect
  parity with the prototype is the goal.
- **State**: Jotai, granular `atomFamily`-per-entity (not one atom per
  board slice) — avoids whole-canvas re-renders on a single drag.
- **Validation**: Zod is the source of truth for the data model; TS types
  are derived via `z.infer<>`. Validates at board load and JSON import.
- **Testing**: Vitest for pure-function unit tests (spec §13); Playwright
  for e2e (interaction-test layer), run via the `playwright-remote-
  browser` skill, using `KANVY_E2E_PORT`/`KANVY_E2E_HOST` for this
  container's forwarded ports. A prior visual-regression tier that diffed
  the new app against the live prototype was removed (see
  `ctx/notes/260917-remove-visual-regression-tier.md`) — the migration is
  complete and cross-app pixel comparison no longer serves a purpose.
  `tsc --noEmit` and a coverage floor on pure-function modules both gate,
  same as lint/tests.
- **Linting/formatting**: Biome (`recommended` + cognitive-complexity
  opt-in), also owns formatting — no Prettier. 2-space indentation.
- **Code health**: `fallow` — complexity/duplication/circular-dependency/
  unused-code checks, gating. `ctx/` is excluded from analysis (process
  material, not app code).
- **Package manager**: pnpm. Single-package repo, no workspace split.

This section records decisions, not literal config contents — check
`biome.json`/`.fallowrc.jsonc`/`vitest.config.ts`/`playwright.config.ts`
for exact rule sets and thresholds.

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
