import type { Page } from '@playwright/test'
import { seedBoard } from '../fixtures/board'

// Shared scene description used to build BOTH the new app's board (v0
// schema, ctx/notes/260915-prototype-migration-phase2-schema.md §2) and
// the prototype's legacy board shape (ctx/support/260915-prototype-source/
// src/data/board.js's cards/groups/edges/images), so a single scenario
// definition seeds equivalent visual content on both live servers (phase 3
// tooling §3 — diffing against the prototype running live, not a
// committed baseline). Deliberately minimal: only the fields either
// schema actually reads for rendering.

export type ColorKey =
  | 'gray'
  | 'coral'
  | 'orange'
  | 'amber'
  | 'lime'
  | 'teal'
  | 'sky'
  | 'violet'
  | 'pink'

export type PatternKey =
  | 'none'
  | 'diagonal'
  | 'graph-paper'
  | 'wiggle'
  | 'plus'
  | 'jupiter'
  | 'topography'
  | 'yyy'
  | 'corkscrew'

export type TaskStatus = 'todo' | 'blocked' | 'in_progress' | 'done'

export interface SceneCard {
  type: 'card'
  id: string
  kind: 'text' | 'link'
  size?: 'regular' | 'big'
  x: number
  y: number
  w: number
  h: number
  color: ColorKey
  content?: string
  imageId?: string
  link?: {
    url: string
    title?: string
    imageUrl?: string
    status: 'loading' | 'ready' | 'error'
  }
  task?: TaskStatus
  updatedAt?: string
}

export interface SceneContainer {
  type: 'container'
  id: string
  x: number
  y: number
  w: number
  h: number
  color: ColorKey
  pattern: PatternKey
  task?: TaskStatus
  updatedAt?: string
}

export type SceneNode = SceneCard | SceneContainer

export interface Scene {
  nodes: SceneNode[]
  /** id -> 1x1 PNG data URI, matching a card's `imageId` (spec §2.6). */
  images?: Record<string, string>
}

// A tiny (1x1, transparent) PNG data URI — enough to exercise the image
// rendering/downsize-consumption path visually without a real asset.
export const PLACEHOLDER_IMAGE_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

const now = () => new Date().toISOString()

function sceneNodeBase(n: SceneNode) {
  return {
    id: n.id,
    x: n.x,
    y: n.y,
    w: n.w,
    h: n.h,
    color: n.color,
    createdAt: n.updatedAt ?? now(),
    updatedAt: n.updatedAt ?? now(),
    ...(n.task ? { task: { status: n.task } } : {}),
  }
}

function buildOurCard(n: SceneCard) {
  const base = { ...sceneNodeBase(n), type: 'card' as const }
  if (n.kind === 'link') {
    return {
      ...base,
      kind: 'link' as const,
      content: n.content ?? '',
      link: n.link ?? {
        url: 'https://example.com',
        status: 'loading' as const,
      },
    }
  }
  if (n.imageId) {
    return {
      ...base,
      kind: 'image' as const,
      imageId: n.imageId,
      content: n.content ?? '',
    }
  }
  return {
    ...base,
    kind: 'text' as const,
    size: n.size ?? ('regular' as const),
    content: n.content ?? '',
  }
}

/** Builds the new app's `Board` (v0 schema) for `scene`. */
export function buildOurBoard(scene: Scene) {
  return {
    version: 1,
    nodes: scene.nodes.map((n) =>
      n.type === 'container'
        ? {
            ...sceneNodeBase(n),
            type: 'container' as const,
            pattern: n.pattern,
          }
        : buildOurCard(n),
    ),
    edges: [],
    images: scene.images ?? {},
  }
}

function legacyGroup(n: SceneContainer) {
  return {
    id: n.id,
    x: n.x,
    y: n.y,
    w: n.w,
    h: n.h,
    color: n.color,
    pattern: n.pattern,
    ...(n.task ? { taskStatus: n.task } : {}),
    createdAt: n.updatedAt ?? now(),
    updatedAt: n.updatedAt ?? now(),
  }
}

function legacyLinkFields(n: SceneCard) {
  if (n.kind !== 'link') return {}
  return {
    linkUrl: n.link?.url ?? 'https://example.com',
    linkTitle: n.link?.title,
    linkImageUrl: n.link?.imageUrl,
    linkStatus: n.link?.status ?? 'loading',
  }
}

function legacyCard(n: SceneCard) {
  return {
    id: n.id,
    x: n.x,
    y: n.y,
    w: n.w,
    color: n.color,
    textSize: n.size ?? 'regular',
    content: n.content ?? '',
    imageId: n.imageId,
    ...legacyLinkFields(n),
    ...(n.task ? { taskStatus: n.task } : {}),
    createdAt: n.updatedAt ?? now(),
    updatedAt: n.updatedAt ?? now(),
  }
}

/** Builds the prototype's legacy `{ cards, groups, edges, images }` shape for `scene`. */
export function buildPrototypeBoard(scene: Scene) {
  const groups = scene.nodes.filter(
    (n): n is SceneContainer => n.type === 'container',
  )
  const cards = scene.nodes.filter((n): n is SceneCard => n.type === 'card')
  return {
    cards: cards.map(legacyCard),
    groups: groups.map(legacyGroup),
    edges: [],
    images: scene.images ?? {},
  }
}

export interface SeedOptions {
  theme?: 'light' | 'dark'
  viewMode?: 'standard' | 'task' | 'recency'
}

/**
 * Seeds a scenario onto ONE page — the caller (a scenario spec) seeds
 * both the new-app page (with `buildOurBoard`) and the prototype page
 * (with `buildPrototypeBoard`), each via this same helper, since both
 * apps use identical localStorage keys for the board/theme/view-mode
 * (`kanvy.board` / `kanvy-theme` / `kanvy-view-mode` — confirmed against
 * ctx/support/260915-prototype-source/src/state/{useBoard,useTheme,
 * useViewMode}.js).
 */
export async function seedScene(
  page: Page,
  board: unknown,
  options: SeedOptions = {},
): Promise<void> {
  await seedBoard(page, board, 'kanvy.board')
  const { theme = 'light', viewMode = 'standard' } = options
  await page.addInitScript(
    ({ theme, viewMode }) => {
      window.localStorage.setItem('kanvy-theme', theme)
      window.localStorage.setItem('kanvy-view-mode', viewMode)
    },
    { theme, viewMode },
  )
}
