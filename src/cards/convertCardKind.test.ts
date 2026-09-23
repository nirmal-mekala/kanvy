import { describe, expect, it } from 'vitest'
import type { CardNode } from '../schema/node'
import {
  convertToImageCard,
  convertToLinkCard,
  convertToTextCard,
  isConvertibleCard,
} from './convertCardKind'

const headingText: CardNode = {
  id: 'c1',
  boardId: 'root',
  type: 'card',
  kind: 'text',
  size: 'h1',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  color: 'gray',
  status: 'active',
  index: 0,
  content: 'hello',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('convertToImageCard', () => {
  it('resets size to regular and drops heading sizing', () => {
    const image = convertToImageCard(headingText, 'img-1')
    expect(image.kind).toBe('image')
    expect(image).not.toHaveProperty('size')
    expect((image as CardNode & { imageId: string }).imageId).toBe('img-1')
  })

  it('drops heading sizing identically for every heading level (h1/h2/h3)', () => {
    for (const size of ['h1', 'h2', 'h3'] as const) {
      const image = convertToImageCard({ ...headingText, size }, 'img-1')
      expect(image).not.toHaveProperty('size')
    }
  })

  it('preserves caption text and color', () => {
    const image = convertToImageCard(headingText, 'img-1')
    expect(image.content).toBe('hello')
    expect(image.color).toBe('gray')
  })
})

describe('convertToLinkCard', () => {
  it('resets size to regular and sets a loading link', () => {
    const link = convertToLinkCard(headingText, 'https://example.com')
    expect(link.kind).toBe('link')
    expect(link).not.toHaveProperty('size')
    expect(link.kind === 'link' && link.link).toEqual({
      url: 'https://example.com',
      status: 'loading',
    })
  })
})

describe('convertToTextCard', () => {
  it('always produces a regular (never a heading size) text card', () => {
    const image = convertToImageCard(headingText, 'img-1')
    const text = convertToTextCard(image)
    expect(text.kind).toBe('text')
    expect(text.kind === 'text' && text.size).toBe('regular')
  })

  it('drops stale image data', () => {
    const image = convertToImageCard(headingText, 'img-1')
    const text = convertToTextCard(image)
    expect(text).not.toHaveProperty('imageId')
  })

  it('can set new content directly', () => {
    const text = convertToTextCard(headingText, 'replaced')
    expect(text.content).toBe('replaced')
  })
})

describe('isConvertibleCard', () => {
  it('is true for text, false for image/link', () => {
    expect(isConvertibleCard(headingText)).toBe(true)
    expect(isConvertibleCard(convertToImageCard(headingText, 'img-1'))).toBe(
      false,
    )
    expect(
      isConvertibleCard(convertToLinkCard(headingText, 'https://example.com')),
    ).toBe(false)
  })

  it('is false for a board card (multiboard support design doc §3 — converting it would orphan the board it references)', () => {
    const boardCard: CardNode = {
      ...headingText,
      kind: 'board',
      boardRef: 'child-1',
    }
    expect(isConvertibleCard(boardCard)).toBe(false)
  })
})
