import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
  seedBoard,
  newCard,
  newGroup,
  newEdge,
  nextId,
  nowISO,
  snapToGrid,
  GRID_SIZE,
  CARD_WIDTH,
  NEW_CARD_HEIGHT_ESTIMATE,
  DEFAULT_TEXT_SIZE,
} from '../data/board.js'

function boxesOverlap(a, b) {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top
}

// Drops any entry in `images` that no card actually references anymore —
// called after anything that could leave one behind (a card deleted, or
// re-converted to point at a different image), so the map doesn't
// accumulate stale base64 blobs forever.
function pruneOrphanedImages(cards, images) {
  const used = new Set(cards.filter((c) => c.imageId).map((c) => c.imageId))
  const kept = Object.fromEntries(Object.entries(images).filter(([id]) => used.has(id)))
  return Object.keys(kept).length === Object.keys(images).length ? images : kept
}

const STORAGE_KEY = 'kanvy.board'
const MAX_HISTORY = 100

// Rapid-fire updates within this window (e.g. every pointermove of a single
// drag) get folded into the same undo step, so undoing a drag jumps back to
// where it started rather than one pixel at a time. A genuine pause longer
// than this starts a fresh step.
const COALESCE_MS = 400

// A board saved before createdAt/updatedAt existed won't have them on any
// of its entities — backfilled here with one shared "now" (rather than
// trying to invent a plausible history) the first time such a board loads.
function withTimestamps(entities, now) {
  return entities.map((e) => (e.createdAt && e.updatedAt ? e : { ...e, createdAt: e.createdAt ?? now, updatedAt: e.updatedAt ?? now }))
}

// Shared by the initial localStorage load and by importing a JSON file
// (see loadBoard below) — explicit field-by-field reconstruction rather
// than a spread merge, since a board from before grouping boxes/connections
// /images/tasks existed (or one hand-edited/trimmed by a user) won't have
// some of these, and however they were ordered in the *given* JSON,
// `images` must land last here so its (large, diff-unfriendly) base64
// blobs always serialize after the actual node data.
function normalizeBoard(parsed) {
  const now = nowISO()
  return {
    groups: withTimestamps(parsed.groups ?? [], now),
    edges: withTimestamps(parsed.edges ?? [], now),
    cards: withTimestamps(parsed.cards ?? [], now),
    images: parsed.images ?? {},
  }
}

function loadInitialBoard() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return normalizeBoard(JSON.parse(raw))
  } catch {
    // ignore corrupt storage, fall back to seed
  }
  return seedBoard
}

function historyReducer(state, action) {
  switch (action.type) {
    case 'update': {
      const next = action.updater(state.present)
      if (next === state.present) return state
      const now = Date.now()
      const coalesce = now - state.lastActionAt < COALESCE_MS
      const past = coalesce ? state.past : [...state.past, state.present].slice(-MAX_HISTORY)
      return { past, present: next, future: [], lastActionAt: now }
    }
    case 'undo': {
      if (state.past.length === 0) return state
      const present = state.past[state.past.length - 1]
      return {
        past: state.past.slice(0, -1),
        present,
        future: [state.present, ...state.future],
        lastActionAt: 0,
      }
    }
    case 'redo': {
      if (state.future.length === 0) return state
      const present = state.future[0]
      return {
        past: [...state.past, state.present],
        present,
        future: state.future.slice(1),
        lastActionAt: 0,
      }
    }
    default:
      return state
  }
}

export function useBoard() {
  const [state, dispatch] = useReducer(historyReducer, undefined, () => ({
    past: [],
    present: loadInitialBoard(),
    future: [],
    lastActionAt: 0,
  }))
  const board = state.present

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board))
  }, [board])

  const update = useCallback((updater) => dispatch({ type: 'update', updater }), [])

  const addCard = useCallback(
    (opts) => {
      const card = newCard(opts)
      update((b) => ({ ...b, cards: [...b.cards, card] }))
      return card.id
    },
    [update],
  )

  // Images live in their own top-level map, keyed by id — a card only ever
  // holds a reference (`imageId`), never the data URI itself. See the
  // seedBoard comment in board.js for why.
  const addImageCard = useCallback(
    ({ x, y, dataUri, content }) => {
      const imageId = nextId('img')
      const card = newCard({ x, y, content, textSize: DEFAULT_TEXT_SIZE, imageId })
      update((b) => ({ ...b, cards: [...b.cards, card], images: { ...b.images, [imageId]: dataUri } }))
      return card.id
    },
    [update],
  )

  // Turns an existing card into an image card in place, keeping its text
  // and color — used when an image is pasted while that card is focused or
  // is the sole selection. Also normalizes it to a standard note's shape
  // (fixed width, auto height, regular-size text): an image card is never
  // "big text" sized, even if the card being converted was.
  const convertCardToImage = useCallback(
    (id, dataUri) => {
      const imageId = nextId('img')
      update((b) => {
        const cards = b.cards.map((c) =>
          c.id === id
            ? { ...c, imageId, textSize: DEFAULT_TEXT_SIZE, w: CARD_WIDTH, h: undefined, updatedAt: nowISO() }
            : c,
        )
        // The new image goes in before pruning, in case this card already
        // had a different one — that old entry is what pruning should drop.
        const images = pruneOrphanedImages(cards, { ...b.images, [imageId]: dataUri })
        return { ...b, cards, images }
      })
    },
    [update],
  )

  // A link node's metadata (title/preview image) isn't known yet at
  // creation time — App.jsx kicks off the microlink.io fetch right after
  // this and fills it in later via a plain updateCard once it resolves.
  const addLinkCard = useCallback(
    ({ x, y, url, content }) => {
      const card = newCard({ x, y, content, textSize: DEFAULT_TEXT_SIZE, linkUrl: url, linkStatus: 'loading' })
      update((b) => ({ ...b, cards: [...b.cards, card] }))
      return card.id
    },
    [update],
  )

  // Turns an existing card into a link node in place — used both when a
  // link is pasted while a (non-image, non-link) card is focused/selected,
  // and when a URL typed into one is "slurped" out of its text. `content`,
  // when given, replaces the card's text (the slurp case, where the URL is
  // removed from what was typed); omitted, it's left as-is (the paste
  // case). Also normalizes size like convertCardToImage does — a link node
  // is never "big text", even if the card being converted was, and it can't
  // carry an image at the same time (images and links are mutually
  // exclusive node kinds), so any prior imageId is dropped and pruned.
  const convertCardToLink = useCallback(
    (id, url, content) => {
      update((b) => {
        const cards = b.cards.map((c) =>
          c.id === id
            ? {
                ...c,
                imageId: undefined,
                linkUrl: url,
                linkTitle: undefined,
                linkImageUrl: undefined,
                linkStatus: 'loading',
                textSize: DEFAULT_TEXT_SIZE,
                w: CARD_WIDTH,
                h: undefined,
                updatedAt: nowISO(),
                ...(content !== undefined ? { content } : {}),
              }
            : c,
        )
        return { ...b, cards, images: pruneOrphanedImages(cards, b.images) }
      })
    },
    [update],
  )

  const addGroup = useCallback(
    (opts) => {
      const group = newGroup(opts)
      update((b) => ({ ...b, groups: [...b.groups, group] }))
      return group.id
    },
    [update],
  )

  const duplicateCards = useCallback(
    (ids) => {
      const idSet = new Set(ids)
      const originals = board.cards.filter((c) => idSet.has(c.id))
      if (originals.length === 0) return []
      const timestamp = nowISO()
      const duplicates = originals.map((original) => ({
        ...original,
        id: nextId('c'),
        x: snapToGrid(original.x + GRID_SIZE * 2),
        y: snapToGrid(original.y + GRID_SIZE * 2),
        createdAt: timestamp,
        updatedAt: timestamp,
      }))
      update((b) => ({ ...b, cards: [...b.cards, ...duplicates] }))
      return duplicates.map((d) => d.id)
    },
    [board, update],
  )

  const updateCard = useCallback(
    (id, patch) => {
      update((b) => ({
        ...b,
        cards: b.cards.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: nowISO() } : c)),
      }))
    },
    [update],
  )

  const moveCard = useCallback(
    (id, x, y) => {
      update((b) => ({
        ...b,
        cards: b.cards.map((c) => (c.id === id ? { ...c, x, y, updatedAt: nowISO() } : c)),
      }))
    },
    [update],
  )

  const updateGroup = useCallback(
    (id, patch) => {
      update((b) => ({
        ...b,
        groups: b.groups.map((g) => (g.id === id ? { ...g, ...patch, updatedAt: nowISO() } : g)),
      }))
    },
    [update],
  )

  // At most one connection between any given pair of nodes, regardless of
  // which end a new drag starts from — dragging onto an already-connected
  // node just selects that existing connection instead of duplicating it.
  const addEdge = useCallback(
    (fromId, fromSide, toId, toSide) => {
      const existing = board.edges.find(
        (ed) => (ed.fromId === fromId && ed.toId === toId) || (ed.fromId === toId && ed.toId === fromId),
      )
      if (existing) return existing.id
      const edge = newEdge({ fromId, fromSide, toId, toSide })
      update((b) => ({ ...b, edges: [...b.edges, edge] }))
      return edge.id
    },
    [board, update],
  )

  const updateEdge = useCallback(
    (id, patch) => {
      update((b) => ({
        ...b,
        edges: b.edges.map((ed) => (ed.id === id ? { ...ed, ...patch, updatedAt: nowISO() } : ed)),
      }))
    },
    [update],
  )

  // In-memory only — "primarily concerned about within the app" for now,
  // not system-clipboard/cross-window interop. Cards and groups only; edges
  // between copied nodes aren't carried over yet. Each paste from the same
  // copy offsets a bit further (a staircase, like repeated Cmd+D), tracked
  // via pasteCount rather than reading current positions, since paste — unlike
  // duplicate — doesn't operate on "whatever's currently selected".
  const clipboardRef = useRef(null)

  const copySelection = useCallback(
    (ids) => {
      const idSet = new Set(ids)
      const cards = board.cards.filter((c) => idSet.has(c.id)).map((c) => ({ ...c }))
      const groups = board.groups.filter((g) => idSet.has(g.id)).map((g) => ({ ...g }))
      if (cards.length === 0 && groups.length === 0) return false
      clipboardRef.current = { cards, groups, pasteCount: 0 }
      return true
    },
    [board],
  )

  // Returns { ids, box } — box is the final (post-offset) world-space
  // bounding box of everything just pasted, so App.jsx can pan the viewport
  // to it if it landed somewhere not currently visible (see Board.jsx's
  // panIntoView). Reads straight off this data rather than the DOM, since
  // the pasted cards/groups haven't rendered yet at the moment this returns.
  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current
    if (!clip || (clip.cards.length === 0 && clip.groups.length === 0)) return { ids: [], box: null }
    clip.pasteCount += 1

    // Bounding box of everything being pasted, at its original (pre-offset)
    // position — a card's real height isn't known without rendering it, so
    // this uses the same rough estimate creation/no-fly-zone placement does.
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    for (const c of clip.cards) {
      left = Math.min(left, c.x)
      top = Math.min(top, c.y)
      right = Math.max(right, c.x + (c.w ?? CARD_WIDTH))
      bottom = Math.max(bottom, c.y + (c.textSize === 'big' ? c.h : NEW_CARD_HEIGHT_ESTIMATE))
    }
    for (const g of clip.groups) {
      left = Math.min(left, g.x)
      top = Math.min(top, g.y)
      right = Math.max(right, g.x + g.w)
      bottom = Math.max(bottom, g.y + g.h)
    }
    const clipBox = { left, top, width: right - left, height: bottom - top }

    // A small staircase offset by default (matching repeated Cmd+D), but if
    // that would land the paste overlapping ANY existing group — including
    // the one it was just copied from — it's pushed further out along the
    // same diagonal until it's clear of all of them. Pasted content always
    // lands on the raw canvas, never spatially "inside" a group by default,
    // since group membership is purely spatial with no formal ownership —
    // landing inside one would make it look adopted by that group.
    const staircase = GRID_SIZE * 2 * clip.pasteCount
    const step = GRID_SIZE * 4
    let offset = staircase
    for (let attempt = 0; attempt < 40; attempt++) {
      const candidate = { left: clipBox.left + offset, top: clipBox.top + offset, width: clipBox.width, height: clipBox.height }
      const overlapsAnyGroup = board.groups.some((g) =>
        boxesOverlap(candidate, { left: g.x, top: g.y, width: g.w, height: g.h }),
      )
      if (!overlapsAnyGroup) break
      offset += step
    }

    const pasteTimestamp = nowISO()
    const newCards = clip.cards.map((c) => ({
      ...c,
      id: nextId('c'),
      x: snapToGrid(c.x + offset),
      y: snapToGrid(c.y + offset),
      createdAt: pasteTimestamp,
      updatedAt: pasteTimestamp,
    }))
    const newGroups = clip.groups.map((g) => ({
      ...g,
      id: nextId('g'),
      x: snapToGrid(g.x + offset),
      y: snapToGrid(g.y + offset),
      createdAt: pasteTimestamp,
      updatedAt: pasteTimestamp,
    }))
    update((b) => ({ ...b, cards: [...b.cards, ...newCards], groups: [...b.groups, ...newGroups] }))
    return {
      ids: [...newCards.map((c) => c.id), ...newGroups.map((g) => g.id)],
      box: { left: clipBox.left + offset, top: clipBox.top + offset, width: clipBox.width, height: clipBox.height },
    }
  }, [board, update])

  const removeItems = useCallback(
    (ids) => {
      const idSet = new Set(ids)
      update((b) => {
        const cards = b.cards.filter((c) => !idSet.has(c.id))
        return {
          ...b,
          cards,
          groups: b.groups.filter((g) => !idSet.has(g.id)),
          // Also drops any edge attached to a card/group that got deleted,
          // not just edges the user selected directly.
          edges: b.edges.filter((ed) => !idSet.has(ed.id) && !idSet.has(ed.fromId) && !idSet.has(ed.toId)),
          images: pruneOrphanedImages(cards, b.images),
        }
      })
    },
    [update],
  )

  // Replaces the whole board with one imported from a JSON file (see
  // App.jsx) — goes through the normal update()/history path rather than
  // resetting it, so an accidental import is just another Ctrl/Cmd+Z away
  // from being undone, same as any other change.
  const loadBoard = useCallback(
    (parsed) => {
      update(() => normalizeBoard(parsed))
    },
    [update],
  )

  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])

  return {
    board,
    addCard,
    addImageCard,
    convertCardToImage,
    addLinkCard,
    convertCardToLink,
    addGroup,
    addEdge,
    duplicateCards,
    copySelection,
    pasteClipboard,
    updateCard,
    moveCard,
    updateGroup,
    updateEdge,
    removeItems,
    loadBoard,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
