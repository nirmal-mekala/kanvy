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

// The backend preset (ctx/notes/261020-network-dialects.md) is persisted
// alongside the base URL, and normalized on read.
describe('networkConfigAtom dialectId', () => {
  async function bootDialectId(): Promise<string> {
    vi.resetModules()
    const { networkConfigAtom } = await import('./networkSettings')
    return createStore().get(networkConfigAtom).dialectId
  }

  it('restores a persisted preset', async () => {
    localStorage.setItem('kanvy-network-dialect', 'postgrest')
    expect(await bootDialectId()).toBe('postgrest')
  })

  it.each([
    ['nothing was persisted (a connection saved before presets existed)', null],
    ['the persisted preset no longer exists', 'retired-backend'],
  ])('falls back to json-server when %s', async (_label, saved) => {
    if (saved !== null) localStorage.setItem('kanvy-network-dialect', saved)
    expect(await bootDialectId()).toBe('json-server')
  })

  it('is written with the base URL and cleared with it', async () => {
    vi.resetModules()
    const { writeNetworkAuthSettings, clearNetworkAuthSettings } = await import(
      './networkSettings'
    )
    writeNetworkAuthSettings(
      { baseUrl: 'http://pg', authToken: '', dialectId: 'postgrest' },
      false,
    )
    expect(localStorage.getItem('kanvy-network-dialect')).toBe('postgrest')
    clearNetworkAuthSettings()
    expect(localStorage.getItem('kanvy-network-dialect')).toBeNull()
  })
})
