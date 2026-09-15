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

/**
 * Resolved hex value for `color` in `theme`. Every color but `gray` uses
 * the same hex in both themes; `gray` has a genuinely distinct light-mode
 * value (spec §3).
 */
export function resolveColorHex(_color: ColorKey, _theme: Theme): string {
  throw new Error('not implemented — phase 7')
}

/** True only for `gray` — the one swatch that renders as a half-light/half-dark split circle. */
export function isThemeDynamic(_color: ColorKey): boolean {
  throw new Error('not implemented — phase 7')
}
