# Styling approach audit (phase 1 of the styling rework)

Phase 1 of the rework the developer outlined on 260930:
1. audit + risk assessment + options (this doc)
2. ~~visual-diff / UI test shoring-up (gate before any change)~~ dropped
   once Option B was chosen (see §8), replaced by a one-off
   computed-style check
3. migration/refactor, tested along the way (outcome in §9)
4. manual developer review

§§1–7 are the audit as written, before any change; nothing in `src/` was
changed to produce them.

## TL;DR

- **This app is not a Tailwind app, and not really a hybrid either.** It's
  a plain-CSS, BEM-named app that happens to have Tailwind installed.
  There are **zero** Tailwind utility classes in any `className` in `src/`,
  and no `@apply`/`@layer`/`@utility`/`@variant` anywhere. Tailwind
  contributes exactly two things: Preflight (its CSS reset, via
  `@import "tailwindcss"`) and the `@theme` block, which in practice only
  declares CSS custom properties that plain `:root` would declare just as
  well.
- **Why it ended up this way:** the migration ported the prototype's
  `index.css` more or less verbatim (the file says so on line 8). Pixel
  parity with the prototype was the goal, and a visual-regression tier
  diffed against the live prototype to enforce it. Copying the CSS was the
  lowest-risk way to pass that tier. **That constraint is gone.** The tier
  was removed on 260917 and the migration is finished, so the original
  reason for the current shape no longer applies.
- **The inline `style={{…}}` usage is mostly principled.** All 12 sites
  pass runtime data (node x/y/w/h, the viewport transform, zoom-scaled grid
  background, per-node colors, menu placement). Tailwind can't express
  runtime values, because arbitrary values have to be known at build time.
  Canvas apps like tldraw, Excalidraw and React Flow do the same thing. At
  most one small subset is worth changing (see §4).
- **There is currently no visual safety net at all.** The 10 Playwright
  specs are interaction-only, with no `toHaveScreenshot` anywhere. Phase 2
  is a hard prerequisite, not a nice-to-have.
- **Recommendation:** first decide on direction. Either go properly
  Tailwind-native, or drop Tailwind and go deliberately CSS-native. The
  current in-between state gives the costs of both and the benefits of
  neither. My lean is **Tailwind-native with a small, explicit residual
  CSS layer** (Option C), but Option B (CSS-native, split files) is a
  legitimate, lower-risk choice. See §6.

## 1. What's actually there

| Fact | Value |
|---|---|
| `src/index.css` | 1,713 lines, the only stylesheet |
| Distinct top-level class selectors | ~141, BEM-style (`.card__inner`, `.board__zoom-btn--reset`) |
| Sections | 17 `/* ---------- x ---------- */` banners (toast, toolbar, board, resize handles, card, container, edges, connectors, edge direction, selection menu, a11y, breadcrumb, board name, board card, confirm modal, emoji menu, …) |
| Tailwind utility classes in JSX | 0 |
| `@apply` / `@layer` / `@utility` / `@variant` | 0 |
| `@theme` tokens | ~20 UI tokens (paper/ink/surface/outline/edge/danger/warn/tip, `--font-mono`) |
| Card color palette (`gray`/`coral`/…) | in TS (`src/colors/colorKey.ts`), **not** `@theme` |
| Dark mode | `[data-theme="dark"]` block that redefines the same custom properties |
| Media queries | 2 (`prefers-reduced-motion`, `hover: none`) |
| Class composition | plain `[...].filter(Boolean).join(' ')` (e.g. `cardClassNames.ts`) |
| Inline `style={{}}` | 12 sites in 6 files |
| Font | Fira Code via a remote Google Fonts `@import` |
| Built CSS | 30.9 kB (6.8 kB gzip) |

## 2. Docs vs. reality drift

Phase 3 tooling (`260915-prototype-migration-phase3-tooling.md` §4) says:

- "**deep Tailwind integration**" for the color palette: the `ColorKey`,
  task-status and recency palettes were all supposed to become `@theme`
  tokens. **Didn't happen.** They're hex maps in TS, resolved per theme in
  JS (`resolveColorHex`, `resolveNodeBorderColor`) and applied as inline
  styles. That choice is the direct cause of the color-related inline
  styles.
- "`clsx` for composing Tailwind classes": later reversed to plain
  string-joining (AGENTS.md is current on this; the phase 3 doc isn't).
- "Pixel-perfect parity with the prototype is the goal" (AGENTS.md
  §Stack): still stated, but no longer enforced by anything, and
  contradicted by `260917-remove-visual-regression-tier.md`, which says
  the new app may diverge deliberately. **AGENTS.md should be updated once
  a direction is chosen.**

## 3. Principled vs. incidental: decision by decision

| Decision | Verdict | Reason |
|---|---|---|
| Design tokens as CSS custom properties, overridden under `[data-theme="dark"]` | **Principled; keep under any option** | Theme switching without duplicate dark classes. Works identically with or without Tailwind (Tailwind v4 has a documented pattern for exactly this). |
| `--modal-font-family` deliberately kept outside `@theme` | **Principled workaround** | Avoids a real Tailwind v4 namespace collision (`--font-*`). A symptom of fighting the tool, and goes away under Option B. |
| Card palette in TS, not tokens | **Partly principled** | Colors are data (a stored `ColorKey`), and are also consumed by SVG pattern generation (`patternBackgroundImage`) and edge rendering, which need hex in JS. But the *border/swatch* use could be CSS-driven. |
| Inline geometry (x/y/w/h, transform, grid bg) | **Principled; keep** | Per-frame runtime values. There is no class-based alternative. |
| One 1,713-line file | **Incidental** (ported artifact) | No technical reason. The banner sections are already natural split points. |
| BEM naming | **Incidental** (ported artifact) | Reasonable on its own terms, but it's what "not using Tailwind" looks like. |
| Tailwind as a dependency | **Currently incidental** | Paying for toolchain, docs expectations and namespace footguns while using ~none of it. |
| Preflight reset | **Unknown, possibly load-bearing** | The ported CSS was written against the prototype's base styles and now silently sits on top of Preflight. Removing Tailwind removes Preflight, which is a probable source of diffs everywhere (button/border/img/margin defaults). |
| Remote Google Fonts `@import` | **Incidental, and a test risk** | Network dependency means font-swap flakiness in screenshot tests. Worth self-hosting regardless of direction. |

## 4. Inline styles in detail

| Site | What | Keep? |
|---|---|---|
| `Card.tsx:312`, `Container.tsx:95` | left/top/width/height from node | Keep |
| `Card.tsx:312` | `borderColor` from `resolveNodeBorderColor` | *Candidate* (see below) |
| `Canvas.tsx:392,406` | grid bg offset/size, viewport transform | Keep |
| `Canvas.tsx:519,531` | marquee / container-preview rect | Keep |
| `SelectionMenu.tsx:101`, `EdgeDirectionControl.tsx:35` | menu position | Keep |
| `SelectionMenu.tsx:110,126` | swatch background, pattern preview | Swatch is a *candidate*; the pattern stays (SVG data URI) |
| `EmojiSuggestionMenu.tsx:185,216` | placement, font size, `grid-template-columns: repeat(n)` | Keep |

The candidates: `ColorKey` is a finite enum, so border and swatch colors
could be driven by `data-color="coral"` plus tokens, with theme and view-mode
handled in CSS. That's an improvement, but a small one. The cleaner idiom
for the geometry sites, if you want one, is to pass CSS variables
(`style={{'--x': …}}`) and let classes consume them. That's cosmetic, and I
wouldn't prioritize it.

## 5. Paths forward

### Option A: status quo, just split the file
Split `index.css` into per-area files along the existing banners and fix
the docs drift. Keep Tailwind as-is.
- **Risk:** very low. Pure moves; cascade order is the only hazard.
- **Downside:** doesn't address "not Tailwind-native" and keeps the unused
  dependency. It's a tidy-up, not a direction.

### Option B: go CSS-native deliberately (remove Tailwind)
- Replace `@theme` with a `:root` token block. Replace Preflight with a
  small explicit reset (or with exactly the Preflight rules the app turns
  out to depend on). Remove `tailwindcss`/`@tailwindcss/vite`.
- Split into colocated per-component stylesheets (`Card.css` next to
  `Card.tsx`) or CSS Modules (scoped names, and unused classes become
  detectable in TS). Modern native CSS (nesting, `color-mix`, `@layer`,
  container queries) covers everything this file does today.
- **Pros:** matches what the code already is, so the smallest conceptual
  change. Removes a toolchain and the namespace footguns. BEM/Modules are
  well suited to a canvas app with lots of stateful selectors
  (`.card--selected .card__bar:hover`).
- **Cons/risk:** Preflight removal is the main visual risk, and it's
  global. Loses Tailwind's shared vocabulary and constraint system, so
  spacing/typography consistency stays manual.
- **Risk:** medium, concentrated in one step (the reset), which is easy to
  isolate and verify.

### Option C: go Tailwind-native (recommended lean)
- Move layout, spacing, typography and simple state styling into utility
  classes in JSX. Promote the palette (card colors, task-status, recency)
  into `@theme` so `border-coral`, `bg-surface` etc. exist. Wire dark mode
  via `@custom-variant dark ([data-theme=dark] &)`, or keep the
  token-redefinition approach, which Tailwind v4 supports.
- Keep a **small, named residual CSS layer** (`@layer components` or
  `@utility`) for what utilities do poorly: resize-handle/connector
  pseudo-element geometry, pattern backgrounds, edge SVG styling,
  multi-level state selectors, textarea quirks, `hover: none` /
  reduced-motion overrides. Expect roughly 15–25% of today's CSS to stay as
  CSS, which is fine as long as it's deliberate and documented.
- Class composition: once utilities are conditionally combined, a helper
  becomes worth it. `clsx` is small; `tailwind-merge` still isn't needed.
  This reverses a recorded decision, so it's your call.
- **Pros:** matches the stated stack. Colocation (a component's styling
  lives in the component). No dead CSS by construction. Enforced design
  scale.
- **Cons/risk:** the largest diff by far (27 TSX files touched). Long
  class strings in heavily stateful components (`Card`, `Canvas`,
  `SelectionMenu`). Arbitrary values (`top-[70px]`, `w-[280px]`) will be
  common unless the scale is extended in `@theme`. Needs a policy on when
  to fall back to CSS, or drift will return.
- **Risk:** medium-high in volume but low per step, *if* it's done one
  component at a time behind screenshot tests.

### Option D: principled hybrid (named for completeness)
Tailwind utilities for "chrome" (toolbar, modals, toasts, breadcrumb,
settings), component CSS for the canvas surface (cards, containers, edges,
handles). Defensible, since the canvas really is CSS-heavy, but it needs a
written boundary rule or it becomes today's state again.

### Direction comparison

| | A | B (CSS-native) | C (Tailwind-native) | D |
|---|---|---|---|---|
| Fixes "one huge file" | ✓ | ✓ | ✓ | ✓ |
| Fixes "not Tailwind-native" | ✗ | n/a (drops Tailwind) | ✓ | partial |
| Change volume | small | medium | large | medium |
| Main visual risk | cascade order | Preflight removal | death by 1,000 cuts | boundary drift |
| Removes a dependency | ✗ | ✓ | ✗ | ✗ |

Common to all options: fix the docs drift, self-host Fira Code, and make
the phase 2 visual suite pass before the first styling commit.

## 6. Risk assessment (whichever option is chosen)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Silent visual regression (no screenshot tests today) | High | High | Phase 2: baseline screenshots from current `main` before touching anything |
| Cascade/specificity changes when splitting or reordering CSS | Medium | Medium | Preserve import order; screenshot per area |
| Hidden Preflight dependencies (B, and C if the reset is changed) | Medium | High (global) | Do it as its own isolated commit with a full screenshot pass |
| Interactive-state regressions (hover, selected, dragging, done, dimmed, resize handles, connectors) that static screenshots miss | High | Medium | Phase 2 scenarios must drive states, not just load pages |
| Theme regressions (dark mode) | Medium | Medium | Every scenario in both themes |
| JS measurement coupling: `Card.tsx` measures `scrollHeight`/`clientHeight` and ResizeObserver height, and a comment hard-codes `calc(100% - 17px)` from CSS | Medium | High (stored `h` is persisted data) | Include auto-grow/heading-clip scenarios; add assertions on stored `h` |
| Screenshot flakiness (fonts over the network, OS font rendering: CI is ubuntu, local runs use the macOS host browser) | High | Medium (erodes trust in the gate) | Self-host font; generate baselines only in one canonical environment |
| Scope creep / behavior change | Medium | Medium | Zero-diff refactor is the default. Any intended visual change goes in its own commit with baseline updates |

## 7. Phase 2 preview (the testing gap)

Not the phase 2 deliverable, but it bears on the decision:

- **Current coverage:** 10 interaction specs (`e2e/*.spec.ts`). These catch
  broken behavior, not broken looks.
- **Proposed core:** Playwright `toHaveScreenshot` with **self-baselines
  generated from current `main`**. This is not the old prototype-diff
  design; the app is its own oracle, and that's exactly the invariant a
  zero-diff refactor needs. The removed tier's scene list
  (`e2e/visual/scenes.ts`, recoverable from git history before 260917) is
  a head start: each card kind, container patterns, task/recency views,
  light/dark.
- **Add:** interactive states (hover, selected, dragging, resize handles,
  connectors, edge direction control, selection menu, emoji menu, modals,
  toasts, board-name editing), `hover: none` and reduced-motion
  emulation, a couple of viewport sizes.
- **Canonical environment:** baselines must come from one place, ideally
  the official Playwright Docker image in CI (same as the ubuntu gate),
  with an "update snapshots" workflow, so they never have to match the
  macOS host.
- **Platform-independent complement:** a computed-style snapshot
  (`getComputedStyle` on key elements, per state, serialized to JSON).
  It's deterministic across OSes and gives an exact answer to "did this
  refactor change anything?". It's also well suited to the Tailwind/CSS
  move, where an identical computed style is the whole goal. Its gap is
  that it can't see paint-level issues, which is why it's paired with
  screenshots.
- **Live site (`https://nirmal.meka.la/kanvy`):** useful as a one-shot
  oracle during the migration (diff local vs. deployed `main`, like the
  old tier), but it goes stale with every deploy. Committed baselines
  should be the gate, and the live site a sanity check.
- **Prereq fixes:** self-host Fira Code (or block the font request and
  wait for `document.fonts.ready`). Disable caret blink, animations and
  transitions in screenshot runs (`animations: 'disabled'`). Mask volatile
  content (recency timestamps).

## 8. Decisions needed from the developer before phase 2

1. **Direction:** A, B, C or D? (This affects which states and
   granularity phase 2 has to cover. Option C needs finer per-component
   coverage.)

I'd like to go with option B. If Tailwind isn’t being used at all right now, it
would seem much wiser to just stick with CSS.

Lets get colors into CSS and slim down style usage to what is genuinely
justifiable (runtime stuff)

2. **Zero-diff:** is the refactor strictly zero-visual-diff, or are small
   deliberate changes allowed (e.g. normalizing spacing to a scale)? If
   allowed, should they be separate commits with explicit baseline updates?

I think we want zero-diff, especially since we are NOT aligning aroudn
tailwind…

3. **If C:** re-adopt `clsx`? Promote the card palette into `@theme`
   (which removes the color inline styles)?

Moot. Removing tailwind.

4. **Test tiers:** screenshots + computed-style snapshots, or screenshots
   only? Should baselines be CI-generated in the Playwright Docker image?

after our discussion… this sounds great in theory, but is way too heavy of a
lift especially given imo we've mitigated risk considerably by aligning on CSS
first.

5. **Pixel parity:** drop the "Pixel-perfect parity with the prototype"
   line from AGENTS.md now (it's already unenforced)?

I think that is fine.

## 9. Phase 3 outcome (Option B, executed 260930)

Five commits on `260930-improve-styling-approach`, one per step:

1. **Remove Tailwind.** `tailwindcss`/`@tailwindcss/vite` dropped.
   Preflight is vendored verbatim as `src/styles/reset.css`, still inside
   `@layer base` so unlayered app rules keep beating it exactly as before,
   with `--theme()` calls resolved to the values they produced. `@theme`
   became a plain `:root` token block.
2. **Split `index.css`.** Each banner section moved verbatim into a
   stylesheet next to its component. Globals (fonts, reset, tokens, base,
   a11y, accents) live in `src/styles/`. `src/index.css` is now only an
   ordered `@import` list, and that order is the cascade order. The one
   reorder (`.board__marquee`/`.board__container-preview` moved above the
   modal/help rules into `canvas.css`) touches no shared elements.
3. **Palette into CSS.** Accent and task-status colors are tokens in
   `tokens.css`. Card/container borders, color swatches and task-status
   glyphs carry `data-accent` / `data-color` / `data-task-status`, mapped
   in `styles/accents.css`. `resolveNodeBorderColor` (hex) became
   `resolveNodeAccent` (a palette key, and now pure: `now` is passed in).
   `resolveTaskStatusColor` and `swatchBackground` are gone, and `Card`/
   `CardBody`/`TaskStatusIcon` no longer take `theme`. The accent hex stays
   duplicated in `colorKey.ts` because SVG pattern generation needs it;
   `colors/palette.test.ts` asserts the two match, per theme. Remaining
   inline styles are all runtime values: node geometry, viewport
   transform/grid, marquee/preview rects, menu placement, emoji-menu
   font size/columns, and generated SVG pattern backgrounds.
4. **Self-host Fira Code.** The exact v27 woff2 subsets Google served, plus
   the OFL, are in `src/assets/fonts/fira-code/`. `styles/fonts.css`
   mirrors Google's `@font-face` rules face for face (two discrete
   weights, not a `300 700` range, so weight-600 text still snaps to 700).
5. **Docs.** AGENTS.md §Stack, the phase 3 tooling note, and this note.

### Verification

A throwaway script (not committed) seeded a board with every card kind,
heading size, task status, pattern and edge direction. For 24 states (both
themes × standard/task/recency, plus card/heading/container selection,
link and board-card hover, view menu, help panel, settings modal, root
board) it recorded every element's full computed style (including
pseudo-elements) and bounding box, plus a screenshot. It was run against
the pre-change build (`02091a8`) and again after each step, all in the
same browser.

- Steps 1, 2 and 4: zero computed-style or geometry differences, apart from
  Tailwind's own `--tw-*`/`--default-*` variables disappearing and the new
  palette variables appearing.
- Step 3: the only differences are on task-status glyphs. Their `color`
  (and properties that default to `currentColor`) is now the status color
  rather than inherited ink, because the color moved from lucide's
  `stroke` attribute to CSS `color`. `stroke` itself is unchanged, and
  the glyphs have no borders or text, so nothing visible changes.
- Screenshots: pixel-identical everywhere except a few anti-aliased pixels
  at one card edge and the link-hover state, which also varied between two
  runs of unchanged code.
- Unit tests, typecheck, lint and the fallow gate pass at every step. The
  e2e suite passed except `networkModeCrud.spec.ts`'s board-CRUD test,
  which timed out once under the full parallel run and passed twice in
  isolation. That's a pre-existing flake unrelated to styling.

### Found along the way (not changed, since the refactor was zero-diff)

- **Accidental Tailwind utilities.** Tailwind was generating ~30 utility
  rules (`.hidden`, `.container`, `.border`, `.transition`, `.truncate`, …)
  from ordinary words in source files. No element in the captured states
  carried any of those classes, so they were dead, and removing Tailwind
  removed them. A future component named e.g. `container` would have been
  silently restyled by one.
- **`.swatch`'s `background-clip: padding-box` has never applied.** The
  swatch fill was an inline `background:` shorthand, which resets
  `background-clip`. The new `accents.css` rules deliberately keep that
  behavior (see the comment there). If the padding-box clip was actually
  intended, switching those rules to `background-color`/`background-image`
  would enable it. That's a small, deliberate visual change for the gray
  swatch's rim.
- **fallow's CSS analysis** now reports ~18 warn-level styling findings
  (raw font-size/shadow values not using tokens, a few complex/high-
  specificity selectors). They pre-date this work and are attributed as
  "introduced" only because the files are new. They don't block the gate,
  and they're candidates for a later, deliberately non-zero-diff cleanup.
- `isThemeDynamic` in `colorKey.ts` is only used by its own test.
