# AGENTS.md

## Where this repo is right now

`kanvy` is a typed React/Jotai/Zod infinite-canvas app. It started as a
plain-JS prototype and was migrated to this stack — preserving prototype
behavior while improving architecture (TypeScript, tests, linting, file
organization, baseline a11y) — and has since moved well past that
starting point through ordinary feature development. The prototype's
source and the migration's process artifacts no longer exist in this
repo; `ctx/notes/260915-kanvy-spec.md` is what survives as the
authoritative description of intended behavior. Before making any change,
re-read this file.

Schema revisions since the initial migration (see spec §2.3):
- **v0.1**: container membership reverted from a formal `parentId` field
  to purely spatial (derived fresh from x/y/w/h, never stored) — see
  `ctx/notes/260916-v0.1-spatial-containers.md` for the rationale.
- Drag-carry requires a node to be *completely within* the dragged
  container, not merely overlapping it.
- **v6**: the home board is designated by a required `isRoot` flag
  (exactly one active root per document), not the reserved id `'root'` —
  its id is an ordinary generated one. Local documents migrate on read;
  network reads are Zod-validated strictly and never repaired. See
  `ctx/notes/261006-root-board-isroot.md`.
- **v7**: a node's `task` is a required bare enum
  (`'none' | 'todo' | 'blocked' | 'in_progress' | 'done'`), not an
  optional `{ status }` object; "not a task" is the explicit `'none'`
  (never `null`/absent). Check it with `isTask(node)`, never truthiness.
  Node fields renamed: `index` → `position`, `type` → `nodeType`,
  `kind` → `cardType` (all SQL-friendlier; fields stay camelCase, with
  snake_case left to the DB mapping layer). Same migration rule as v6:
  local migrates, network rejects the old shape. See
  `ctx/notes/261008-flat-task-status.md`,
  `ctx/notes/261008-position-rename.md` and
  `ctx/notes/261008-node-type-card-type-rename.md`.
  `ctx/support/migrate-v6-to-v7.mjs`
  converts v6 data outside the app; extend it with every further v7 change
  (`src/schema/migrateV6ToV7Script.test.ts` fails if it drifts from
  `schema/legacy.ts`).
- **Tinted nodes** (visual, not schema): a chromatic accent colors the
  whole card/container (fill + edge + ink), not only its border; gray and
  task-todo stay border-only, and pink is a muted rose, not nord9. See
  `ctx/notes/261007-tinted-cards.md`.

Multi-board support (spec §14's deferred "Multiboard support" item) is
implemented: the schema v3 shape (`boards` collection, `boardId`-scoped
shared `nodes`/`edges`, a `board` card kind) and TanStack Router-based
home-board navigation are in place — see
`ctx/notes/260917-multiboard-support-design.md` for the design rationale.

The action-based (ops) undo stack, tombstoning for nodes/edges/boards, and
TanStack Query as the mutation layer are implemented — see
`ctx/notes/260921-action-based-undo-and-tombstoning.md` for the design and
`src/state/ops.ts`/`src/state/history/boardHistoryAtom.ts` for the result.

Network mode / backend integration (a REST backend, json-server for now,
alongside the existing localStorage-backed Local mode) is implemented —
see `ctx/notes/260923-network-mode-backend-integration-design.md` for the
design and `src/api/`, `src/state/networkBoardLoader.ts`,
`src/components/settings/SettingsModal.tsx` for the result. Modes are
"ships in the night": switching never migrates data either direction, and
network settings (mode/base URL/auth token) are in-memory only, reset on
reload. A network create's server-assigned id is reconciled directly into
canonical app state (not a side table) the instant it's known — see
`ctx/notes/260925-network-id-reconciliation.md` and `src/state/
entityReconcile.ts`/`src/state/networkReconcile.ts`.

Link-card metadata fetching no longer proxies through microlink.io (its
free tier's ~25 req/day cap made it unsustainable). A same-origin raw
`fetch()` of the pasted/typed URL was tried and dropped (CORS broke it
for most real sites) in favor of proxying through metadata.party
(`POST https://api.metadata.party/extract`), a CORS-enabled extraction
API — see `ctx/notes/260927-metadata-party-proxy.md` and `src/cards/
linkMetadata.ts`.

Do not use this file to track test/build pass counts or a changelog of
fixed bugs — that state goes stale immediately and belongs in test output
and git history, not here.

## The `ctx` directory

`ctx/` holds design/decision docs for this app and is the primary source
of context for agents working in this repo:

- `ctx/notes/` — human- or agent-authored docs, findings, specs. Agents
  may create/edit files here.
- `ctx/support/` — reference material for the current stack (json-server's
  docs) and standalone support scripts (e.g. `migrate-v6-to-v7.mjs`).

Markdown files in `ctx/` follow `YYMMDD-<title>.md`, dated by creation
date, never last-edited date.

**Read before starting implementation work:**
- `ctx/notes/260915-kanvy-spec.md` — the v0 spec, authoritative for app
  behavior and data model.
- `ctx/notes/260915-prototype-migration-phase2-schema.md` — the resolved
  schema shape.
- `ctx/notes/260915-prototype-migration-phase3-tooling.md` — stack
  decisions (§Stack below is a summary; read this for the *why*).

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
- **Styling**: plain CSS, BEM-named classes, no framework (Tailwind was
  removed — see `ctx/notes/260930-styling-approach-audit.md`). One
  stylesheet per component, colocated (`components/card/card.css`);
  globals (fonts, vendored Preflight reset, tokens, a11y, palette
  consumers) in `src/styles/`. `src/index.css` is the only entry point
  and its `@import` order *is* the cascade order. Colors are tokens in
  `styles/tokens.css`, dark mode redefines them under
  `[data-theme="dark"]`; state-driven colors are data attributes
  (`data-accent`, `data-color`, `data-task-status`) mapped in
  `styles/accents.css`. Inline `style` is only for runtime values
  (geometry, viewport transform, menu placement, generated SVG
  patterns). Fira Code is self-hosted.
- **State**: Jotai, granular `atomFamily`-per-entity (not one atom per
  board slice) — avoids whole-canvas re-renders on a single drag.
- **Validation**: Zod is the source of truth for the data model; TS types
  are derived via `z.infer<>`. Validates at board load.
- **Testing**: Vitest for pure-function unit tests (spec §13); Playwright
  for e2e (interaction-test layer), run via the `playwright-remote-
  browser` skill, using `KANVY_E2E_PORT`/`KANVY_E2E_HOST` for this
  container's forwarded ports. A prior visual-regression tier that diffed
  the new app against the live prototype was removed (see
  `ctx/notes/260917-remove-visual-regression-tier.md`) — the migration is
  complete and cross-app pixel comparison no longer serves a purpose.
  `tsc --noEmit` and a coverage floor on pure-function modules both gate,
  same as lint/tests. Network-mode e2e specs spin up a real `json-server`
  instance via `e2e/fixtures/jsonServer.ts` against a throwaway `db.json`,
  bound to a host-forwarded port (`KANVY_E2E_JSON_SERVER_PORT`, defaults to
  1996) the same way the Vite dev server itself is.
- **Dev backend**: `json-server` (devDependency) — `pnpm dev:server` runs
  it against `server/db.json` (mutated in place by every network-mode
  write — not repo root, so it doesn't sit alongside source) on
  `KANVY_JSON_SERVER_PORT` (default 1996), for exercising Network mode
  against a real REST backend during development. `vite.config.ts` excludes
  it from the dev server's file watcher, since json-server rewriting it on
  every write would otherwise trigger a full Vite reload mid-session.
  `server/db.json` is gitignored and generated, never hand-authored or
  committed — `pnpm db:init` (`server/generate-db.ts`) builds it from this
  app's own `Node`/`Edge`/`BoardMeta`/`ImageEntry` types and validates the
  result against `BoardSchema`, so it can't silently drift from a schema
  change the way a static fixture would; `dev:server` runs it
  automatically first (only creates the file if missing — never clobbers
  a live session's data), and `pnpm db:init -- --force` resets it
  explicitly. Its content is a design-review fixture: one showcase board
  per topic (kinds, accents, task states, recency bands, images, links,
  containers, edges) covering every persisted node state, for reviewing
  visual changes across theme × view mode. Restart json-server after a
  `--force` regen — it otherwise rewrites the file from its stale
  in-memory copy on the next write.
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
