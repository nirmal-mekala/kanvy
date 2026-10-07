# Tinted cards (261007)

Source of the direction: `ctx/support/261007-card-states-design-updates-file.html`
— a standalone card-state workspace with a "current" section that mirrors
`src/` and a "concept" section the developer iterated on. Its
`style#concept-css` header is the design brief. This note records what was
ported and what is still open.

## What changed

A node's resolved accent now colors the whole component, not only its
3px border. "Resolved" means whatever `resolveNodeAccent` picks: the node's
own color, its task status in task view, or its recency band in recency
view. So all three view modes tint the same way.

- **Light theme**: the fill is the accent lifted toward white (oklab, 82%),
  the ink is a deep accent shade (28% accent, 72% black), and the edge is
  the accent darkened (72%).
- **Dark theme**: the fill is the accent pulled toward `#2e3440` (42%), the
  edge is the full-strength accent, and the ink is a pale accent tint (16%
  accent into white).
- **Neutral accents** (`gray`, `task-todo`) are not tinted. They keep the
  original border-only styling.
- **Task glyphs** on a tinted node draw in the node's ink. A done-green
  glyph on a lime card was invisible otherwise.
- **Pink** changed from nord9 (`#81a1c1`, a blue) to a muted rose,
  `#d295b2`, in both `tokens.css` and `colorKey.ts` (`palette.test.ts`
  keeps the two in sync).

How it works (`src/styles/accents.css`): each `[data-accent]` rule only
sets `--accent`. One shared rule then re-themes the node locally by
redefining the tokens the rest of the CSS already uses (`--color-surface`,
`--color-surface-hover`, `--color-ink`, `--color-ink-soft`, `--color-dot`,
`--color-border-soft`, `--color-outline`). It builds them from three knobs
that are set per theme: `--tint-fill`, `--tint-ink` and `--tint-edge`.
No component CSS changed. To tune the look, edit only the two recipe rules.

Contrast measured by the concept author (WCAG, ink against fill, across
every tinted accent): light is at least 6.27:1 and dark at least 4.60:1.
Dark amber is the tightest pair, so re-check it if a knob changes.

The spec (§3, §4.5, §6.1, §6.2) was updated to match.

## Open questions (not decided; flagged for review)

- **Containers.** The concept's selectors include `.container-node`, so
  containers tint too. This was ported as written, but it was never
  reviewed in the workspace. A same-hue SVG pattern (`colors/patterns.ts`,
  0.5 opacity of the raw accent) over a same-hue tinted fill is close to
  invisible in light mode. See the Containers board in the db.json fixture.
  Options include tinting the pattern with `--tint-ink`, or leaving
  containers border-only.
- **Selection-menu swatches** still show the raw accent, not the tinted
  fill.
- **Edges, toolbar and modals** are untouched by this direction.
- **Pre-existing bug, unrelated to this change**: `.recency-indicator`
  uses `var(--color-ink-muted)`, which is not defined anywhere. It falls
  back to the inherited color, which on a tinted node is the tint ink.

## Review fixture

`server/generate-db.ts` now generates a design-review document. It has one
showcase board per topic, linked from Home, and covers every persisted
node state. Interaction states (hover, selected, editing) aren't data, so
check those live. Its two sample images (`server/fixtures/*.png`) come
from the workspace HTML.
