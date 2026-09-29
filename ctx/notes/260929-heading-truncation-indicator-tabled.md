# Heading truncation indicator — tabled, then resolved

Spec §5.2 says a truncated heading should show *some* visual cue instead
of silently clipping mid-line. Two implementations were tried and both
were reverted (below); a third attempt at the flat-glyph approach,
combined with two real bugs it exposed and fixed, is what's actually
implemented in the codebase now (see "Resolution" at the bottom).

## Attempt 1: gradient fade

A bottom-edge `linear-gradient(transparent → --color-surface)` overlay
(`.card__content-fade`), shown only when JS (`Card.tsx`'s
`useOverflowClipped`) detected `scrollHeight > clientHeight`. Rejected on
design grounds: this app's other affordances (task-status dots, connector
circles, the board icon) are consistently flat glyphs/lines, never
textured/shadowed — the fade read as out of step once seen in place.

## Attempt 2: flat glyph

A small `lucide-react` `MoreHorizontal` (`⋯`) icon in the bottom-right
corner, colored `--color-ink-soft`, same trigger condition. Matched the
flat-affordance intent, but the developer reported it "doesn't seem to be
working very well" and suspected a bug, without further specifics at
tabling time.

## Interim state (both attempts reverted)

Both attempts were fully reverted (`useOverflowClipped`,
`CardContentTruncationIndicator`/`CardContentFade`, the CSS, and their
e2e coverage) in the same session. A heading still truncated rather than
scrolled (spec §5.2's core behavior, unaffected) but had no dedicated
visual cue beyond the content itself looking cut off.

## What "doesn't seem to be working very well" turned out to be

The developer's report on attempt 2 bundled two things that were only
separable in hindsight:

1. **The glyph looked "always present."** Every glyph e2e test seeded a
   heading-sized node directly into localStorage — never exercised the
   realistic create-as-regular-then-convert-to-heading flow. That flow
   has two real bugs, both fixed in `Card.tsx`:
   - **Stale inline textarea height.** `useAutoGrowHeight` sets an
     imperative `el.style.height` while a card is a regular
     (auto-growing) note, and previously just returned early once the
     card became a heading — never clearing that inline style. An
     inline style always beats a CSS class rule (the heading's
     `height: calc(100% - 17px)`, `index.css`), so a card typed as
     regular text and then converted to a heading stayed frozen at its
     small pre-conversion height forever, however its box was later
     resized. Found from a screen recording showing the textarea
     visibly shrink-wrapped to one line inside a much taller selected
     box. Fixed by clearing `el.style.height` the moment a card becomes
     a heading.
   - **Placeholder-driven false positive.** An *empty* `<textarea>`'s
     `scrollHeight` in Chromium is measured from its wrapped
     *placeholder* text ("Write something..."), not its (empty) value —
     confirmed via an isolated repro with no app CSS involved. A heading
     with a long placeholder wrapping across several lines at a large
     font size read as clipped despite having no real content in it,
     which is exactly what made the glyph look permanently stuck "on."
     Fixed by short-circuiting `useOverflowClipped` to `false` whenever
     `content === ''`.
2. The developer was *also* seeing the stale-inline-height bug itself at
   the same time (a second, independent report — see the git history
   around 2026-09-29), which made it hard to tell the glyph's own
   behavior apart from that bug's symptom (a visibly wrong box size).

## Resolution

With both bugs fixed, the flat `MoreHorizontal` (`⋯`) glyph
(`CardContentTruncationIndicator`, `CardBody.tsx`; `.card__content-more`,
`index.css`) is back in place and e2e-covered specifically through the
live conversion flow (not just a directly-seeded heading), so a
regression here would be caught again.
