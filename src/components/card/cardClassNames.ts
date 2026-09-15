// Extracted out of Card.tsx as a small pure function — testable in
// isolation (spec §13 favors unit tests for exactly this kind of pure
// logic) rather than folded into the component itself.

import type { CardNode } from '../../schema/node'

export function cardClassNames(
  node: CardNode,
  opts: {
    isBig: boolean
    isDone: boolean
    isDimmed: boolean
    selected: boolean
  },
): string {
  return [
    'card',
    opts.isBig && 'card--big',
    node.kind === 'image' && 'card--image',
    node.kind === 'link' && 'card--link',
    opts.isDone && 'card--done',
    opts.isDimmed && 'card--dimmed',
    opts.selected && 'card--selected',
  ]
    .filter(Boolean)
    .join(' ')
}
