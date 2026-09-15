// Background fills for grouping-box nodes, built from the `hero-patterns`
// package (an MIT-licensed port of the SVGs from heropatterns.com). Each
// function takes a fill color + opacity and returns a ready-to-use
// `background-image` value with its own tile size baked into the SVG.
import { diagonalLines, graphPaper, wiggle, plus, jupiter, topography, yyy, corkScrew } from 'hero-patterns'

export const DEFAULT_PATTERN = 'none'

// Opacity the pattern tint renders at over the group's neutral base fill.
export const PATTERN_OPACITY = 0.5

export const PATTERNS = {
  none: { label: 'Plain', fn: null },
  diagonalLines: { label: 'Diagonal lines', fn: diagonalLines },
  graphPaper: { label: 'Graph paper', fn: graphPaper },
  wiggle: { label: 'Wiggle', fn: wiggle },
  plus: { label: 'Plus', fn: plus },
  jupiter: { label: 'Jupiter', fn: jupiter },
  topography: { label: 'Topography', fn: topography },
  yyy: { label: 'YYY', fn: yyy },
  corkScrew: { label: 'Corkscrew', fn: corkScrew },
}

export function patternBackgroundImage(patternKey, colorHex, opacity = PATTERN_OPACITY) {
  const pattern = PATTERNS[patternKey]
  if (!pattern?.fn) return 'none'
  return pattern.fn(colorHex, opacity)
}
