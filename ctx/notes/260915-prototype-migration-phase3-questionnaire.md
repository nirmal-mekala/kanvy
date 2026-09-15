# prototype-migration phase 3 questionnaire — tooling, config, and stack

## Status of this document

Draft questionnaire for prototype-migration phase 3 of
`ctx/prompt/260915-migration-process.md` ("align on tooling, config, and
stack"). Builds on `ctx/notes/260915-kanvy-spec.md` (prototype-migration
phase 1) and `ctx/notes/260915-prototype-migration-phase2-schema.md`
(prototype-migration phase 2). Answers here should resolve the open items
prototype-migration phase 2 §6 flagged as "a phase 3 style call" (e.g.
`PatternKey`/`ColorKey` as string-literal unions vs. enums), plus the phase 3
scope named directly in the migration prompt: code health tooling, linting,
testing frameworks, and FE libraries.

## Method

Reviewed:

- `ctx/prompt/260915-migration-process.md` §"prototype-migration phase 3" —
  names the four scope areas below directly (code health, linting, testing
  frameworks, FE libraries).
- `ctx/notes/260915-kanvy-spec.md` — particularly §13 (testing priorities,
  already partially settled in phase 1) and the top-line improvement areas
  (TypeScript, Tailwind, Jotai, debouncing, de-duplication, file length,
  linting, error handling, a11y).
- `ctx/support/260915-prototype-source/package.json` — today's prototype
  stack: React 19, Vite, `oxlint` for linting, `lucide-react` for icons,
  `hero-patterns` for container backgrounds. No test runner, no TS, no
  Tailwind, no state library today.

This questionnaire does not re-ask anything already decided in phase 1/2
(e.g. Jotai is already committed to in the migration prompt; discriminated
card unions are already decided in phase 1 Q2). It only covers what phase 3
is scoped to align on. 18 questions.

---

## A. Code health & complexity

**1. Code health tool.** The migration prompt says "lean toward strict,
maximalist ... config" for a code health solution but doesn't name one (e.g.
SonarQube/SonarLint, `eslint-plugin-sonarjs`, `dependency-cruiser` for
import-graph/circular-dependency checks, or relying on Biome's own
complexity lints alone). Is there a specific tool in mind, or should this be
whatever combination best enforces the file-length and complexity concerns
called out in the spec?

- we want to use `fallow` and take advantage of as many of its features as we
  can

**2. What triggers a failure, not just a warning?** For a "maximalist"
config, should violations (complexity, file length, duplication) fail CI /
block commit, or surface as warnings an agent is expected to self-correct
without a hard gate?

- i am most concerned about the agent knowing they are on track for all of this,
  but failing CI is nice as well
- update AGENTS.md accordingly

**3. File-length ceiling.** The spec calls out "a few files have grown too
large and bloated" as a known prototype problem (`Board.jsx`, `useBoard.js`
in particular). Should the new config enforce a concrete line-count ceiling
per file (and if so, roughly what number), or is this left qualitative
("keep files focused, no hard number")?

- lean in to fallow here. i don't have a hard number in mind, but you can use
  your judgement

**4. Duplication detection.** Should the tooling include an automated
duplicate-code detector (e.g. `jscpd`), or is de-duplication left to code
review / agent judgment without a dedicated tool?

- fallow

## B. Linting

**5. Biome scope.** The migration prompt specifically names Biome for
linting (moving off `oxlint`). Should Biome also own formatting (replacing
the need for Prettier), or is formatting a separate/undecided tool?

- yes. lets use biome

**6. Biome rule strictness.** "Strict" — does that mean enabling Biome's
`recommended` rule set plus its stricter opt-in rules (e.g.
`nursery`/complexity rules), or a specific named preset? Any rules that
should be explicitly *off* despite being in a strict preset (e.g. rules that
would fight the discriminated-union/Jotai patterns this migration is
adopting)?

- opt in to defaults. opt in to noExcessiveCognitiveComplexity

**7. Import/module boundaries.** Should linting enforce any structural rules
beyond syntax/style — e.g. forbidding deep relative imports across feature
folders, enforcing a particular file-organization convention — or is that
out of scope for phase 3 (a phase 5 implementation-plan concern instead)?

- look into either a biome or fallow way to avoid circular deps, beyond that im
  not too concerned.

## C. Testing frameworks

**8. Unit/component test runner.** Phase 1 §13 already settled the *split*
(e2e primary, unit tests for pure functions, no dedicated component tier)
but not the runner. Vitest (pairs naturally with Vite, already the build
tool) is the default assumption — confirm, or is there a reason to prefer
something else (Jest, `node:test`)?

- Vitest is greta

**9. E2e framework.** Phase 1 §17 already settled mocking the Clipboard API
rather than using real browser permission grants — Playwright is a natural
fit for browser automation either way. Confirm Playwright, or is there a
different e2e tool in mind?

- playwright is great

**10. Type-checking as a test gate.** Should `tsc --noEmit` (or equivalent)
run as part of the same CI gate as tests/lint, or be treated as a separate
concern?

- fail CI

**11. Coverage targets.** Should v0 set an explicit coverage threshold
(e.g. a CI-enforced percentage) for unit tests on pure functions, or is
coverage tracked informally / not gated for v0?

- use your judgment to set a moderately high coverage threshold

**12. Visual regression.** Given the migration prompt leans toward a
"pixel-perfect" Tailwind port of the existing styling, should the test
suite include visual regression / screenshot-diff testing (e.g. Playwright's
built-in screenshot assertions) to catch unintended styling drift, or is
manual comparison sufficient for v0?

- i like the idea of visual diffing - especially because we have the original
  source code. are you able to come up with an approach that would allow visual
  diffs against the origina impl?

## D. FE libraries & build stack

**13. Zod scope.** Zod is named in the migration prompt. Should it validate
at every board load (replacing/complementing the "normalize/backfill
legacy documents" leniency phase 1 §2.7/§9 already calls for), JSON
import specifically, or both? Should the TS types in
`ctx/notes/260915-prototype-migration-phase2-schema.md` §2 be derived from
Zod schemas (`z.infer`) as the single source of truth, or hand-written TS
types with separate Zod schemas kept in sync manually?

- use zod as source of truth for sure
- use zod as primary validation tool
- board load and JSON import i would think

**14. TypeScript strictness.** Full `strict: true` plus stricter opt-ins
(`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, etc.), or baseline
`strict: true` only?

- full strict true is great

**15. UI component primitives.** The prototype hand-rolls its UI (no
component library) with `lucide-react` for icons (keep, per "preserve
icons"). For the Tailwind rewrite, should any headless UI primitives library
be introduced for things like the help-panel modal, selection menu, and
color/pattern pickers (e.g. Radix UI, Headless UI), or should these stay
fully hand-rolled to match "pixel-perfect" fidelity with minimal
abstraction risk?

- i like the fully hand rolled.
- there isn’t a ton of UI and its not wildly complex, so i feel good about this
  decision

**16. Tailwind version & config approach.** Tailwind v4 (CSS-first config,
current as of the prototype's React 19/Vite versions) or v3? Given the
spec's Nord-derived fixed color palette (§3) and `GRID_SIZE`/`CARD_WIDTH`
constants, should these become Tailwind theme tokens (`theme.extend`), or
kept as plain TS/CSS constants referenced directly, with Tailwind used only
for layout/spacing utility classes?

- deeper integration with tailwind prefered for colors
- it feels less important to me that GRID_SIZE and CARD_WIDTH be handled within
  tailwind, but ultimately im ambivalent on this

**17. Package manager & monorepo shape.** Any preference on package manager
(npm, as the prototype already uses via `package-lock.json`, vs. pnpm/yarn),
and should this stay a single-package repo or split into a workspace (e.g.
separate packages for a future json-server backend vs. the frontend)?

- pnpm is preferred. i dont think we're going to need monorepo, backend should
  ideally be extremely ligth - just json file and that CLI staticly serving this
  app

**18. Jotai conventions.** The migration prompt commits to Jotai but not its
usage pattern. Should atoms be organized as one atom per top-level board
slice (`nodesAtom`, `edgesAtom`, `imagesAtom`), a more granular per-entity
atom family (`atomFamily` keyed by node id, to minimize re-render scope per
the prompt's stated goal of not re-rendering the whole canvas on a single
drag), or should that granularity be a phase 5 implementation-plan decision
rather than a phase 3 stack-alignment one?

- i think you can lean into your judgment. i lean toward the granular approach
  you metnioend.

---

## Next step

Developer answers inline (or in a follow-up note), then this feeds the
phase 3 deliverable — a concrete tooling/config alignment doc — before
prototype-migration phase 4 (agent readiness).
