// Collapses emojibase-data's raw per-variant entries (gendered forms and
// skin tones are separate top-level records with unrelated-looking
// hexcodes) into one searchable `EmojiEntry` "family" per emoji, with the
// gender/skin-tone forms addressable via `variantChars`. There's no field
// in the dataset that already links these, and gender is actually encoded
// two different, unrelated ways across the dataset — both were derived
// and validated against the full ~1900-entry English dataset (grep the
// git history of this file for the validation script if the grouping
// ever needs re-deriving from scratch):
//
// - A shared base + a ZWJ+gender-codepoint (2642/2640) suffix, e.g. "elf"
//   (1F9DD) → "man elf" (1F9DD-200D-2642-FE0F). Handled by stripping that
//   suffix pair to find the shared base.
// - A *different first codepoint entirely* for each gender, all followed
//   by the same ZWJ+role suffix, e.g. "technologist" (1F9D1, the
//   deliberately gender-neutral "person" base) / "man technologist"
//   (1F468) / "woman technologist" (1F469) — all "1F468-200D-1F4BB" etc.
//   Missing this pattern was a real bug: these professions/roles never
//   merged into one family, so e.g. ":tech" surfaced "man technologist"
//   and "woman technologist" as separate, ungendered-looking top-level
//   results instead of one neutral "technologist" entry with a gender
//   axis in its variant grid. Handled by matching on the first codepoint
//   instead. Must exclude any hexcode whose *remainder* also contains a
//   person/man/woman/boy/girl/child codepoint — those are multi-person
//   compositions (family/couple/kiss emoji), where swapping the base
//   changes who's in the scene, not a gender variant of the same person.
//
// Both patterns key by the hexcode *with the gender signal removed*, but
// each pattern's key is tagged with which pattern produced it — otherwise
// a stripped person-swap key can collide with an unrelated plain emoji's
// own hexcode (e.g. "technologist"'s stripped key is "1F4BB", which is
// also the bare "laptop" emoji's actual hexcode).

import {
  type EmojiEntry,
  type Gender,
  type SkinTone,
  variantKey,
} from './emojiTypes'

export interface RawEmojiSkin {
  hexcode: string
  unicode: string
}

export interface RawEmoji {
  hexcode: string
  label: string
  unicode: string
  tags?: readonly string[]
  skins?: readonly RawEmojiSkin[]
}

const GENDER_CODEPOINTS: Record<string, Gender> = {
  '2642': 'man',
  '2640': 'woman',
}

const TONE_CODEPOINTS: Record<string, SkinTone> = {
  '1F3FB': 1,
  '1F3FC': 2,
  '1F3FD': 3,
  '1F3FE': 4,
  '1F3FF': 5,
}

const GENDER_ORDER: readonly Gender[] = ['neutral', 'man', 'woman']

/** First-codepoint gender bases for the "person/man/woman base swap" pattern (technologist, teacher, red hair, …). */
const PERSON_BASE_GENDER: Record<string, Gender> = {
  '1F9D1': 'neutral',
  '1F468': 'man',
  '1F469': 'woman',
}

/** Any of these appearing in the *remainder* means the sequence combines multiple people (family/couple/kiss) — not a single-person gender variant. */
const PERSON_CODEPOINTS = new Set([
  '1F9D1',
  '1F468',
  '1F469',
  '1F466',
  '1F467',
  '1F9D2',
])

function personBaseSwapGender(parts: readonly string[]): Gender | null {
  const first = parts[0]
  const gender = first ? PERSON_BASE_GENDER[first] : undefined
  if (!gender || parts[1] !== '200D') return null
  const rest = parts.slice(2)
  if (rest.some((part) => PERSON_CODEPOINTS.has(part))) return null
  return gender
}

/** Strips `FE0F` variation selectors and a ZWJ+gender-codepoint (2642/2640) pair, tracking the gender that pair encoded. */
function stripZwjGenderSuffix(parts: readonly string[]): {
  gender: Gender
  baseKey: string
} {
  let gender: Gender = 'neutral'
  const kept: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part === 'FE0F') continue
    const nextGender =
      part === '200D' ? GENDER_CODEPOINTS[parts[i + 1] ?? ''] : undefined
    if (part === '200D' && nextGender) {
      gender = nextGender
      i++
      continue
    }
    if (part !== undefined) kept.push(part)
  }
  return { gender, baseKey: kept.join('-') }
}

/**
 * Splits a hexcode into its gender and a "base key" such that a family's
 * neutral/man/woman forms all resolve to the same key — see the file-top
 * comment for the two unrelated ways gender shows up in hexcodes. Each
 * pattern's key is prefixed with which pattern produced it, so the two
 * never collide with each other or with an unrelated plain emoji.
 */
export function analyzeHexcode(hexcode: string): {
  gender: Gender
  baseKey: string
} {
  const parts = hexcode.split('-')
  const personGender = personBaseSwapGender(parts)
  if (personGender) {
    return { gender: personGender, baseKey: `role:${parts.slice(2).join('-')}` }
  }
  const { gender, baseKey } = stripZwjGenderSuffix(parts)
  return { gender, baseKey: `zwj:${baseKey}` }
}

function toneOfHexcode(hexcode: string): SkinTone | null {
  for (const part of hexcode.split('-')) {
    const tone = TONE_CODEPOINTS[part]
    if (tone) return tone
  }
  return null
}

type Family = Partial<Record<Gender, RawEmoji>>

function groupByBaseKey(raw: readonly RawEmoji[]): Map<string, Family> {
  const families = new Map<string, Family>()
  for (const entry of raw) {
    const { gender, baseKey } = analyzeHexcode(entry.hexcode)
    const family = families.get(baseKey) ?? {}
    family[gender] = entry
    families.set(baseKey, family)
  }
  return families
}

/** Merges one gender member's own base char, tags, and skin-tone variants into the family's shared `variantChars`/`tones`/`keywords` accumulators. */
function collectMember(
  gender: Gender,
  member: RawEmoji,
  variantChars: Map<string, string>,
  tones: Set<SkinTone>,
  keywords: Set<string>,
) {
  variantChars.set(variantKey(gender, 0), member.unicode)
  for (const tag of member.tags ?? []) keywords.add(tag.toLowerCase())
  for (const skin of member.skins ?? []) {
    const tone = toneOfHexcode(skin.hexcode)
    if (!tone) continue
    variantChars.set(variantKey(gender, tone), skin.unicode)
    tones.add(tone)
  }
}

function buildEntry(family: Family): EmojiEntry | null {
  const primary = family.neutral ?? family.man ?? family.woman
  if (!primary) return null

  const genders = GENDER_ORDER.filter((g) => family[g])
  const tones = new Set<SkinTone>([0])
  const variantChars = new Map<string, string>()
  const keywords = new Set<string>()

  for (const gender of genders) {
    const member = family[gender]
    if (member) collectMember(gender, member, variantChars, tones, keywords)
  }

  return {
    id: primary.hexcode,
    char: primary.unicode,
    name: primary.label,
    keywords: [...keywords],
    genders,
    tones: [...tones].sort((a, b) => a - b),
    variantChars,
  }
}

export function normalizeEmojiData(raw: readonly RawEmoji[]): EmojiEntry[] {
  const results: EmojiEntry[] = []
  for (const family of groupByBaseKey(raw).values()) {
    const entry = buildEntry(family)
    if (entry) results.push(entry)
  }
  return results
}
