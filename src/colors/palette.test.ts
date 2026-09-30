/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ColorKeySchema } from '../schema/node'
import { resolveColorHex, type Theme } from './colorKey'

// The accent palette is duplicated: tokens.css renders it, colorKey.ts
// feeds SVG pattern generation. This keeps the two from drifting.
// (Read from disk: Vitest stubs out CSS imports, `?raw` included.)
const tokensCss = readFileSync(
  new URL('../styles/tokens.css', import.meta.url),
  'utf8',
)

function customProps(selector: string): Map<string, string> {
  const start = tokensCss.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no ${selector} block in tokens.css`)
  const block = tokensCss.slice(start, tokensCss.indexOf('\n}', start))
  const props = new Map<string, string>()
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    if (name && value) props.set(name, value.trim())
  }
  return props
}

function resolveToken(name: string, theme: Theme): string | undefined {
  const light = customProps(':root')
  const scope = theme === 'dark' ? customProps('[data-theme="dark"]') : light
  const value = scope.get(name) ?? light.get(name)
  const ref = value?.match(/^var\((--[\w-]+)\)$/)?.[1]
  return ref ? resolveToken(ref, theme) : value
}

describe('accent palette: tokens.css matches colorKey.ts', () => {
  for (const theme of ['light', 'dark'] as const) {
    it.each(ColorKeySchema.options)(`%s (${theme})`, (color) => {
      expect(
        resolveToken(`--color-accent-${color}`, theme)?.toLowerCase(),
      ).toBe(resolveColorHex(color, theme))
    })
  }
})

describe('task-status palette', () => {
  const statuses = ['todo', 'blocked', 'in-progress', 'done']

  it('defines every status', () => {
    for (const status of statuses) {
      expect(resolveToken(`--color-task-${status}`, 'light')).toMatch(
        /^#[0-9a-f]{6}$/i,
      )
    }
  })

  it('varies only todo by theme', () => {
    for (const status of statuses) {
      const differs =
        resolveToken(`--color-task-${status}`, 'light') !==
        resolveToken(`--color-task-${status}`, 'dark')
      expect(differs).toBe(status === 'todo')
    }
  })

  it('gives every status a distinct color within a theme', () => {
    const colors = statuses.map((s) =>
      resolveToken(`--color-task-${s}`, 'light'),
    )
    expect(new Set(colors).size).toBe(statuses.length)
  })
})
