// Phase 6 stub — signatures only, per ctx/notes/260915-kanvy-spec.md §3.
// Phase 7 Stage 3 fills in the real logic (colors/). Superseded once
// schema/ (phase 7 Stage 1) makes ColorKey a Zod-enum-derived type — this
// local union is a throwaway stand-in until then.

export type ColorKey =
  | 'gray'
  | 'coral'
  | 'orange'
  | 'amber'
  | 'lime'
  | 'teal'
  | 'sky'
  | 'violet'
  | 'pink'

export type Theme = 'light' | 'dark'

// Nord's Frost + Aurora accents (nord3, nord7-9, nord11-15). Nord has no
// pink, so that slot borrows nord9 (a mid blue) instead — spec §3.
const COLORS: Record<ColorKey, string> = {
  gray: '#4c566a', // nord3
  coral: '#bf616a', // nord11
  orange: '#d08770', // nord12
  amber: '#ebcb8b', // nord13
  lime: '#a3be8c', // nord14
  teal: '#8fbcbb', // nord7
  sky: '#88c0d0', // nord8
  violet: '#b48ead', // nord15
  pink: '#81a1c1', // nord9
}

// nord3 (COLORS.gray) reads as low-contrast in dark mode but as a strong,
// standout tone against light surfaces — the opposite of "subtle" there.
// This is gray's actual light-mode value instead (spec §3).
const GRAY_LIGHT = '#b8c0cc'

/**
 * Resolved hex value for `color` in `theme`. Every color but `gray` uses
 * the same hex in both themes; `gray` has a genuinely distinct light-mode
 * value (spec §3).
 */
export function resolveColorHex(color: ColorKey, theme: Theme): string {
  if (color === 'gray' && theme === 'light') return GRAY_LIGHT
  return COLORS[color]
}

/** True only for `gray` — the one swatch that renders as a half-light/half-dark split circle. */
export function isThemeDynamic(color: ColorKey): boolean {
  return color === 'gray'
}

/**
 * CSS `background` value for a color-picker swatch button (spec §3) — a
 * plain fill for every static color, but a half-light/half-dark split for
 * `gray` specifically, so its swatch visibly signals "this one changes
 * with the theme." Always shows both halves regardless of the current
 * theme — `resolveColorHex` is what picks the single theme-appropriate one
 * for actually rendering a card/container/edge.
 */
export function swatchBackground(color: ColorKey): string {
  if (color === 'gray') {
    return `linear-gradient(90deg, ${GRAY_LIGHT} 50%, ${COLORS.gray} 50%)`
  }
  return COLORS[color]
}
