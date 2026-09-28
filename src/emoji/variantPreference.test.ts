import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_VARIANT_PREFERENCE,
  getPreferredVariant,
  isVariantPreference,
  setPreferredVariant,
} from './variantPreference'

class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string) {
    return this.store.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  })
})

describe('isVariantPreference', () => {
  it('accepts a well-formed preference', () => {
    expect(isVariantPreference({ gender: 'man', tone: 3 })).toBe(true)
  })

  it('rejects an unknown gender', () => {
    expect(isVariantPreference({ gender: 'alien', tone: 0 })).toBe(false)
  })

  it('rejects a tone outside 0-5', () => {
    expect(isVariantPreference({ gender: 'neutral', tone: 6 })).toBe(false)
  })

  it('rejects non-object values', () => {
    expect(isVariantPreference(null)).toBe(false)
    expect(isVariantPreference('woman')).toBe(false)
  })
})

describe('getPreferredVariant / setPreferredVariant', () => {
  it('returns the default when nothing has been stored', () => {
    expect(getPreferredVariant()).toEqual(DEFAULT_VARIANT_PREFERENCE)
  })

  it('round-trips a stored preference', () => {
    setPreferredVariant({ gender: 'woman', tone: 4 })
    expect(getPreferredVariant()).toEqual({ gender: 'woman', tone: 4 })
  })

  it('falls back to the default when the stored value is corrupt JSON', () => {
    localStorage.setItem('kanvy-emoji-variant-preference', '{not json')
    expect(getPreferredVariant()).toEqual(DEFAULT_VARIANT_PREFERENCE)
  })
})
