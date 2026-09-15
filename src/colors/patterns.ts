// Container background fills (spec §3), built from the `hero-patterns`
// package — an MIT-licensed port of the SVGs from heropatterns.com. Ported
// from ctx/support/260915-prototype-source/src/data/patterns.js onto the
// v0 schema's `PatternKey` names (schema/node.ts).

import {
  corkScrew,
  diagonalLines,
  graphPaper,
  jupiter,
  plus,
  topography,
  wiggle,
  yyy,
} from 'hero-patterns'
import type { PatternKey } from '../schema/node'

type PatternFn = (color: string, opacity: number) => string

const PATTERN_FNS: Partial<Record<PatternKey, PatternFn>> = {
  diagonal: diagonalLines,
  'graph-paper': graphPaper,
  wiggle,
  plus,
  jupiter,
  topography,
  yyy,
  corkscrew: corkScrew,
}

/** Opacity the pattern tint renders at over the container's neutral base fill. */
const PATTERN_OPACITY = 0.5

/**
 * CSS `background-image` value for `pattern`, tinted `colorHex` — always
 * the fixed neutral tone (spec §3), never the container's own accent
 * color. Returns `undefined` for `'none'` (plain, no background image).
 */
export function patternBackgroundImage(
  pattern: PatternKey,
  colorHex: string,
  opacity: number = PATTERN_OPACITY,
): string | undefined {
  const fn = PATTERN_FNS[pattern]
  return fn ? fn(colorHex, opacity) : undefined
}
