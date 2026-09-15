import { describe, expect, it } from 'vitest'
import { newTextCard } from '../cards/newCard'
import { createContainer } from '../containers/createContainer'
import { selectionTextForSystemClipboard } from './systemClipboard'

describe('selectionTextForSystemClipboard', () => {
  it('joins non-empty card captions with a newline', () => {
    const a = { ...newTextCard(0, 0), content: 'first' }
    const b = { ...newTextCard(0, 0), content: 'second' }
    expect(selectionTextForSystemClipboard([a, b])).toBe('first\nsecond')
  })

  it('excludes containers', () => {
    const card = { ...newTextCard(0, 0), content: 'only this' }
    const container = createContainer({ x: 0, y: 0, w: 100, h: 100 })
    expect(selectionTextForSystemClipboard([card, container])).toBe('only this')
  })

  it('excludes cards with empty/whitespace-only content', () => {
    const blank = { ...newTextCard(0, 0), content: '   ' }
    expect(selectionTextForSystemClipboard([blank])).toBeUndefined()
  })

  it('returns undefined rather than an empty string when there is nothing to write', () => {
    expect(selectionTextForSystemClipboard([])).toBeUndefined()
  })
})
