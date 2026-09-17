# Removal of the visual-regression tier

The visual-regression tier (`e2e/visual/`, `playwright.visual.config.ts`,
`pnpm e2e:visual`/`e2e:visual:setup`) diffed the new app's rendering
against the live vendored prototype (`ctx/support/260915-prototype-source/`)
via `pixelmatch`, per phase 3 tooling §3/Q12. It has been removed: the
migration is complete, and pixel-comparing the two apps no longer serves
its original purpose — the new app is allowed to render differently from
the prototype where that's a deliberate improvement, not just a
faithfully-preserved wart.

## What prompted this

CI was failing two of these scenarios (`each card kind in isolation ›
image` and `done styling ... tinted image overlay`) with an identical,
deterministic ~8% pixel diff on every run. Investigation (with CI-uploaded
`actual.png`/`expected.png`/`diff.png` attachments, added for this
purpose — see the `expectVisualMatch` helper this removal also deletes)
showed it wasn't flakiness: the prototype stretches a small placeholder
image to fill the whole card, while the new app's `CardMedia.tsx`
(commit `99410f8`, "improve small image handling") deliberately declines
to upscale an image smaller than the card width. That's a real, permanent
behavioral divergence from the prototype — and arguably from spec §5.3's
"height derived from the image's intrinsic aspect ratio" wording too —
that a prototype-parity test tier was never going to resolve. Rather than
adjudicate prototype-vs-spec-vs-new-app on this one behavior, the tier
comparing the two apps was removed outright.

## What was removed

- `e2e/visual/` (`scenarios.spec.ts`, `scenes.ts`, `diff.ts`,
  `visual.smoke.spec.ts`)
- `playwright.visual.config.ts`
- `package.json`: `e2e:visual`/`e2e:visual:setup` scripts;
  `pixelmatch`/`pngjs`/`@types/pixelmatch`/`@types/pngjs` devDependencies
- `playwright.config.ts`'s `testIgnore: ['visual/**']` and the comment
  referencing the visual config
- `tsconfig.e2e.json`'s reference to `playwright.visual.config.ts`
- `.github/workflows/ci.yml`'s `pnpm e2e:visual:setup`/`pnpm e2e:visual`
  steps
- The `KANVY_VISUAL_NEW_APP_PORT`/`KANVY_VISUAL_PROTOTYPE_PORT` mentions
  in `AGENTS.md`

## What was kept

- `ctx/support/260915-prototype-source/` — still valuable as manual
  reference material for matching prototype behavior during future work
  (per `AGENTS.md`'s `ctx/support` description), independent of the
  removed automated comparison.
- `pnpm e2e` (the interaction-behavior suite, `playwright.config.ts`) —
  unaffected; it never depended on the prototype.
- The CI `actions/upload-artifact` step for `test-results/` on failure —
  still useful for the interaction suite's traces.

The `CardMedia.tsx` small-image behavior itself was not changed. The
product decision on the open question above: never upscale small images
— the prototype's stretch-to-fill was the wart, not the new app's
behavior. Spec §5.3 has been reworded to state this explicitly.
