import { describe, expect, it } from 'vitest'
import { newTextCard } from '../cards/newCard'
import { duplicateNodes } from './duplicateNodes'

describe('duplicateNodes', () => {
  it('returns an empty array for an empty input', () => {
    expect(duplicateNodes([])).toEqual([])
  })

  it('gives each duplicate a fresh id and offsets its position', () => {
    const original = newTextCard(100, 100)
    const [dup] = duplicateNodes([original])
    expect(dup?.id).not.toBe(original.id)
    expect(dup?.x).toBeGreaterThan(original.x)
    expect(dup?.y).toBeGreaterThan(original.y)
  })

  it('preserves parentId (unlike paste, duplicate does not force nodes out of a container)', () => {
    const original = { ...newTextCard(0, 0), parentId: 'container-1' }
    const [dup] = duplicateNodes([original])
    expect(dup?.parentId).toBe('container-1')
  })
})
