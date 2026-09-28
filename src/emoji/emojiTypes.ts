// Shared shape for the normalized emoji dataset (built by
// normalizeEmojiData.ts from emojibase-data's raw JSON) and consumed by
// searchEmoji.ts, variantList.ts, and the `:` trigger UI.

export type Gender = 'neutral' | 'man' | 'woman'

/** 0 = no skin tone applied (the emoji's default rendering). */
export type SkinTone = 0 | 1 | 2 | 3 | 4 | 5

export interface EmojiEntry {
  /** The base (neutral, tone 0) hexcode — stable across reloads. */
  id: string
  /** Default rendering: neutral gender, no skin tone. */
  char: string
  name: string
  keywords: readonly string[]
  /** Which gender forms exist for this emoji, `'neutral'` first when present. */
  genders: readonly Gender[]
  /** Which skin tones exist for this emoji, `0` first. */
  tones: readonly SkinTone[]
  /** `variantKey(gender, tone)` -> the character for that combination. */
  variantChars: ReadonlyMap<string, string>
}

export function variantKey(gender: Gender, tone: SkinTone): string {
  return `${gender}:${tone}`
}
