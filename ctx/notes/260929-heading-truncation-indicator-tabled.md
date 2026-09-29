# Heading truncation indicator — tabled

Spec §5.2 says a truncated heading should show *some* visual cue instead
of silently clipping mid-line. Two implementations were tried and both
were reverted; the feature itself (not just the visual treatment) is
tabled for now.

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

## Current state

Both attempts were fully reverted (`useOverflowClipped`,
`CardContentTruncationIndicator`/`CardContentFade`, the CSS, and their
e2e coverage) in the same session. A heading still truncates rather than
scrolling (spec §5.2's core behavior, unaffected) — it just has no
dedicated visual cue beyond the content itself looking cut off. Revisit
if/when this is picked back up; check with the developer for the
specific bug/UX complaint before re-attempting a fix blind.
