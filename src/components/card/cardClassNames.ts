// Extracted out of Card.tsx as a small pure function — testable in
// isolation (spec §13 favors unit tests for exactly this kind of pure
// logic) rather than folded into the component itself.

import type { CardNode, TextSize } from '../../schema/node'

// Static literals (not a template-literal interpolation) so a CSS-usage
// analyzer can actually match these against index.css's `.card--h1`/`.card--h2`/
// `.card--h3` rules — a dynamic `` `card--${size}` `` string is invisible
// to that kind of static analysis and gets (falsely) flagged as dead CSS.
const HEADING_CLASS: Record<TextSize, string | false> = {
  regular: false,
  h1: 'card--h1',
  h2: 'card--h2',
  h3: 'card--h3',
}

export function cardClassNames(
  node: CardNode,
  opts: {
    /** The card's text size when it's `kind: 'text'`, else `null` (image/link cards never carry one). */
    headingSize: TextSize | null
    isDone: boolean
    isDimmed: boolean
    selected: boolean
    dragging: boolean
  },
): string {
  return [
    'card',
    opts.headingSize && HEADING_CLASS[opts.headingSize],
    node.kind === 'image' && 'card--image',
    node.kind === 'link' && 'card--link',
    opts.isDone && 'card--done',
    opts.isDimmed && 'card--dimmed',
    opts.selected && 'card--selected',
    opts.dragging && 'card--dragging',
  ]
    .filter(Boolean)
    .join(' ')
}
