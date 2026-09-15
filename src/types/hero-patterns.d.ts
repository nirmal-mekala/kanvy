// `hero-patterns` ships no type declarations of its own (spec §3 pattern
// backgrounds — see colors/patterns.ts). Each named export is a
// `(color, opacity) => backgroundImageCssValue` factory.
declare module 'hero-patterns' {
  export type PatternFactory = (color: string, opacity: number) => string

  export const diagonalLines: PatternFactory
  export const graphPaper: PatternFactory
  export const wiggle: PatternFactory
  export const plus: PatternFactory
  export const jupiter: PatternFactory
  export const topography: PatternFactory
  export const yyy: PatternFactory
  export const corkScrew: PatternFactory
}
