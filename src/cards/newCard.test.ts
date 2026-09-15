import { describe, expect, it } from 'vitest'
import { CARD_WIDTH } from '../geometry/constants'
import { newImageCard, newLinkCard, newTextCard } from './newCard'

describe('newTextCard', () => {
  it('creates a regular text card centered on the given point', () => {
    const card = newTextCard(100, 100, 'hello')
    expect(card.kind).toBe('text')
    expect(card.kind === 'text' && card.size).toBe('regular')
    expect(card.content).toBe('hello')
    expect(card.w).toBe(CARD_WIDTH)
    expect(card.x).toBe(100 - CARD_WIDTH / 2)
  })

  it('generates a unique id per call', () => {
    expect(newTextCard(0, 0).id).not.toBe(newTextCard(0, 0).id)
  })
})

describe('newImageCard', () => {
  it('derives height from the aspect ratio', () => {
    const card = newImageCard(100, 100, 'img-1', 2) // 2:1 aspect ratio
    expect(card.kind).toBe('image')
    expect(card.kind === 'image' && card.imageId).toBe('img-1')
    expect(card.h).toBe(Math.round(CARD_WIDTH / 2))
  })
})

describe('newLinkCard', () => {
  it('creates a loading link card', () => {
    const card = newLinkCard(100, 100, 'https://example.com')
    expect(card.kind).toBe('link')
    expect(card.kind === 'link' && card.link).toEqual({
      url: 'https://example.com',
      status: 'loading',
    })
  })
})
