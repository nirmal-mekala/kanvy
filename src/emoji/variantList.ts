// Lays out an EmojiEntry's gender x skin-tone combinations as a grid the
// variant sub-menu (EmojiSuggestionMenu.tsx) renders and arrow-key-
// navigates: genders as rows (y axis), skin tones as columns (x axis) —
// and finds which cell matches the user's remembered preference
// (variantPreference.ts) so it can be pre-selected.

import type { EmojiEntry, Gender, SkinTone } from './emojiTypes'
import { variantKey } from './emojiTypes'

export interface VariantOption {
  gender: Gender
  tone: SkinTone
  char: string
}

export interface VariantGrid {
  /** Rows, in `entry.genders` order. */
  genders: readonly Gender[]
  /** Columns, in `entry.tones` order. */
  tones: readonly SkinTone[]
  /** `cells[row][col]` — `null` for a gender x tone combination this entry doesn't have. */
  cells: readonly (VariantOption | null)[][]
}

export function hasVariants(entry: EmojiEntry): boolean {
  return entry.genders.length > 1 || entry.tones.length > 1
}

export function buildVariantGrid(entry: EmojiEntry): VariantGrid {
  const cells = entry.genders.map((gender) =>
    entry.tones.map((tone) => {
      const char = entry.variantChars.get(variantKey(gender, tone))
      return char ? { gender, tone, char } : null
    }),
  )
  return { genders: entry.genders, tones: entry.tones, cells }
}

export interface GridCell {
  row: number
  col: number
}

export function findDefaultCell(
  grid: VariantGrid,
  preferred: { gender: Gender; tone: SkinTone },
): GridCell {
  const row = grid.genders.indexOf(preferred.gender)
  const col = grid.tones.indexOf(preferred.tone)
  return { row: row === -1 ? 0 : row, col: col === -1 ? 0 : col }
}
