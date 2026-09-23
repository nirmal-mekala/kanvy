// `hero-patterns` ships no type declarations of its own (spec §3 pattern
// backgrounds — see colors/patterns.ts). Each named export is a
// `(color, opacity) => backgroundImageCssValue` factory.
declare module 'hero-patterns' {
  export type PatternFactory = (color: string, opacity: number) => string

  export const fallingTriangles: PatternFactory
  export const leaf: PatternFactory
  export const wiggle: PatternFactory
  export const plus: PatternFactory
  export const linesInMotion: PatternFactory
  export const topography: PatternFactory
  export const rain: PatternFactory
  export const squares: PatternFactory
}
