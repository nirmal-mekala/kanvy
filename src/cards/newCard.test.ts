import { describe, expect, it } from 'vitest'
import { CARD_WIDTH } from '../geometry/constants'
import { newBoardCard, newImageCard, newLinkCard, newTextCard } from './newCard'

describe('newTextCard', () => {
  it('creates a regular text card centered on the given point', () => {
    const card = newTextCard(100, 100, 'hello')
    expect(card.cardType).toBe('text')
    expect(card.cardType === 'text' && card.size).toBe('regular')
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
    expect(card.cardType).toBe('image')
    expect(card.cardType === 'image' && card.imageId).toBe('img-1')
    expect(card.h).toBe(Math.round(CARD_WIDTH / 2))
  })
})

describe('newLinkCard', () => {
  it('creates a link card with null metadata (fetch state is in-memory)', () => {
    const card = newLinkCard(100, 100, 'https://example.com')
    expect(card.cardType).toBe('link')
    expect(card).toMatchObject({
      linkUrl: 'https://example.com',
      linkTitle: null,
      linkImageUrl: null,
    })
  })
})

describe('newBoardCard', () => {
  it('creates a board card referencing the given boardRef', () => {
    const card = newBoardCard(100, 100, 'child-1')
    expect(card.cardType).toBe('board')
    expect(card.cardType === 'board' && card.boardRef).toBe('child-1')
    expect(card.w).toBe(CARD_WIDTH)
    expect(card.x).toBe(100 - CARD_WIDTH / 2)
  })

  it('generates a unique id per call', () => {
    expect(newBoardCard(0, 0, 'a').id).not.toBe(newBoardCard(0, 0, 'a').id)
  })
})
