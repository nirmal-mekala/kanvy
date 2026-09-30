import { createStore } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// A persisted base URL is App.tsx's own signal to attempt a boot-time
// reconnect — `bootPhaseAtom` starts `'resolving'` exactly when there's
// something for that attempt to resolve, and `'ready'` (nothing to wait
// for) otherwise. Each case needs its own fresh module instance since the
// atom's initial value is computed once, at import time, from whatever
// localStorage.getItem returns then.
describe('bootPhaseAtom', () => {
  it("starts 'resolving' when a network base URL was persisted", async () => {
    localStorage.setItem('kanvy-network-base-url', 'https://api.example.test/')
    vi.resetModules()
    const { bootPhaseAtom } = await import('./networkSettings')
    expect(createStore().get(bootPhaseAtom)).toBe('resolving')
  })

  it("starts 'ready' when no network base URL was persisted", async () => {
    vi.resetModules()
    const { bootPhaseAtom } = await import('./networkSettings')
    expect(createStore().get(bootPhaseAtom)).toBe('ready')
  })
})
