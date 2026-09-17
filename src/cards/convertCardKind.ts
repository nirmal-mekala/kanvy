// Kind-conversion rules (spec §2.2, §5.3, §5.4): a card converting between
// `text`/`image`/`link` is a full object replacement at the type level, not
// a field mutation — matches actual behavior (dropping any heading size
// — h1/h2/h3 — back to `'regular'`, discarding stale `link`/`imageId`
// data) rather than fighting the discriminated union (phase2 schema §2's
// notes).

import type { CardNode } from '../schema/node'

type CommonFields = Pick<
  CardNode,
  | 'id'
  | 'boardId'
  | 'x'
  | 'y'
  | 'w'
  | 'h'
  | 'color'
  | 'task'
  | 'content'
  | 'createdAt'
  | 'updatedAt'
>

function commonFields(card: CardNode): CommonFields {
  const {
    id,
    boardId,
    x,
    y,
    w,
    h,
    color,
    task,
    content,
    createdAt,
    updatedAt,
  } = card
  return {
    id,
    boardId,
    x,
    y,
    w,
    h,
    color,
    ...(task !== undefined ? { task } : {}),
    content,
    createdAt,
    updatedAt,
  }
}

/** Converts `card` to a regular (never big) text card, preserving its caption text and color. */
export function convertToTextCard(card: CardNode, content?: string): CardNode {
  return {
    ...commonFields(card),
    type: 'card',
    kind: 'text',
    size: 'regular',
    ...(content !== undefined ? { content } : {}),
  }
}

/** Converts `card` to an image card referencing `imageId` — always resets `size` to `'regular'` (spec §2.2). */
export function convertToImageCard(card: CardNode, imageId: string): CardNode {
  return {
    ...commonFields(card),
    type: 'card',
    kind: 'image',
    imageId,
  }
}

/** Converts `card` to a loading link card for `url` — always resets `size` to `'regular'` (spec §2.2). */
export function convertToLinkCard(card: CardNode, url: string): CardNode {
  return {
    ...commonFields(card),
    type: 'card',
    kind: 'link',
    link: { url, status: 'loading' },
  }
}

/** True for a card that isn't already `image` or `link` — the only kind of card spec §5.3/§5.4 allow converting in place. */
export function isConvertibleCard(card: CardNode): boolean {
  return card.kind !== 'image' && card.kind !== 'link'
}
