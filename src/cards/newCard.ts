// Fresh card factories (spec §5.1, §5.3, §5.4) — creation, not conversion
// (see convertCardKind.ts for converting an existing card in place).

import { CARD_WIDTH, NEW_CARD_HEIGHT_ESTIMATE } from '../geometry/constants'
import { generateId } from '../schema/legacy'
import type { CardNode } from '../schema/node'

/** A fresh regular text card, centered on `(x, y)` (spec §5.1) — created via double-click canvas, ⌘/Ctrl+N, or typing/pasting plain text with nothing selected. */
export function newTextCard(x: number, y: number, content = ''): CardNode {
  const now = new Date().toISOString()
  return {
    id: generateId(),
    type: 'card',
    kind: 'text',
    size: 'regular',
    x: x - CARD_WIDTH / 2,
    y: y - NEW_CARD_HEIGHT_ESTIMATE / 2,
    w: CARD_WIDTH,
    h: NEW_CARD_HEIGHT_ESTIMATE,
    color: 'gray',
    content,
    createdAt: now,
    updatedAt: now,
  }
}

/** A fresh image card referencing `imageId`, centered on `(x, y)`, sized from the image's aspect ratio (spec §5.3). */
export function newImageCard(
  x: number,
  y: number,
  imageId: string,
  aspectRatio: number,
): CardNode {
  const now = new Date().toISOString()
  const h = Math.round(CARD_WIDTH / aspectRatio)
  return {
    id: generateId(),
    type: 'card',
    kind: 'image',
    x: x - CARD_WIDTH / 2,
    y: y - h / 2,
    w: CARD_WIDTH,
    h,
    color: 'gray',
    content: '',
    imageId,
    createdAt: now,
    updatedAt: now,
  }
}

/** A fresh loading link card for `url`, centered on `(x, y)` (spec §5.4) — metadata fetch is a separate step. */
export function newLinkCard(x: number, y: number, url: string): CardNode {
  const now = new Date().toISOString()
  return {
    id: generateId(),
    type: 'card',
    kind: 'link',
    x: x - CARD_WIDTH / 2,
    y: y - NEW_CARD_HEIGHT_ESTIMATE / 2,
    w: CARD_WIDTH,
    h: NEW_CARD_HEIGHT_ESTIMATE,
    color: 'gray',
    content: '',
    link: { url, status: 'loading' },
    createdAt: now,
    updatedAt: now,
  }
}
