import { describe, expect, it } from 'vitest'
import type { CardNode } from '../schema/node'
import {
  convertToImageCard,
  convertToLinkCard,
  convertToTextCard,
  isConvertibleCard,
} from './convertCardKind'

const bigText: CardNode = {
  id: 'c1',
  type: 'card',
  kind: 'text',
  size: 'big',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  color: 'gray',
  content: 'hello',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('convertToImageCard', () => {
  it('resets size to regular and drops big-text sizing', () => {
    const image = convertToImageCard(bigText, 'img-1')
    expect(image.kind).toBe('image')
    expect(image).not.toHaveProperty('size')
    expect((image as CardNode & { imageId: string }).imageId).toBe('img-1')
  })

  it('preserves caption text and color', () => {
    const image = convertToImageCard(bigText, 'img-1')
    expect(image.content).toBe('hello')
    expect(image.color).toBe('gray')
  })
})

describe('convertToLinkCard', () => {
  it('resets size to regular and sets a loading link', () => {
    const link = convertToLinkCard(bigText, 'https://example.com')
    expect(link.kind).toBe('link')
    expect(link).not.toHaveProperty('size')
    expect(link.kind === 'link' && link.link).toEqual({
      url: 'https://example.com',
      status: 'loading',
    })
  })
})

describe('convertToTextCard', () => {
  it('always produces a regular (never big) text card', () => {
    const image = convertToImageCard(bigText, 'img-1')
    const text = convertToTextCard(image)
    expect(text.kind).toBe('text')
    expect(text.kind === 'text' && text.size).toBe('regular')
  })

  it('drops stale image data', () => {
    const image = convertToImageCard(bigText, 'img-1')
    const text = convertToTextCard(image)
    expect(text).not.toHaveProperty('imageId')
  })

  it('can set new content directly', () => {
    const text = convertToTextCard(bigText, 'replaced')
    expect(text.content).toBe('replaced')
  })
})

describe('isConvertibleCard', () => {
  it('is true for text, false for image/link', () => {
    expect(isConvertibleCard(bigText)).toBe(true)
    expect(isConvertibleCard(convertToImageCard(bigText, 'img-1'))).toBe(false)
    expect(
      isConvertibleCard(convertToLinkCard(bigText, 'https://example.com')),
    ).toBe(false)
  })
})
