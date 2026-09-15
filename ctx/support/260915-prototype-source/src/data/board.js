import { DEFAULT_PATTERN } from './patterns.js'

// Tag/card colors — Nord's Frost + Aurora accents (nord3, nord7-9, nord11-15).
// Nord has no pink, so that slot borrows nord9 (a mid blue) instead.
export const COLORS = {
  gray: '#4c566a', // nord3
  coral: '#bf616a', // nord11
  orange: '#d08770', // nord12
  amber: '#ebcb8b', // nord13
  lime: '#a3be8c', // nord14
  teal: '#8fbcbb', // nord7
  sky: '#88c0d0', // nord8
  violet: '#b48ead', // nord15
  pink: '#81a1c1', // nord9
}

// nord3 (COLORS.gray) is a muted, low-contrast neutral against Polar
// Night's dark surfaces, but reads as a strong, standout mid-dark tone
// against Snow Storm's light ones — the opposite of "subtle" there. This is
// what "gray" actually resolves to in light mode instead, matching the same
// quiet, low-contrast quality relative to its (light) surroundings.
export const GRAY_LIGHT = '#b8c0cc'

// The default color — assigned to freshly created cards/groups/edges, and
// the first swatch in every color picker — is the one place where "gray"
// needs to actually look neutral in both themes, not just in dark mode.
// Everything else in COLORS reads reasonably against either theme as-is.
export function resolveColor(colorKey, theme) {
  if (colorKey === 'gray' && theme === 'light') return GRAY_LIGHT
  return COLORS[colorKey] ?? COLORS.gray
}

// What a color picker swatch button should show — a plain fill for every
// static color, but a half-light/half-dark split for "gray" specifically,
// so its swatch visibly signals "this one changes with the theme" rather
// than looking like just another fixed color. Always shows both halves
// regardless of the current theme — resolveColor (above) is what picks the
// single theme-appropriate one for actually rendering a card/group/edge.
export function swatchBackground(colorKey) {
  if (colorKey === 'gray') return `linear-gradient(90deg, ${GRAY_LIGHT} 50%, ${COLORS.gray} 50%)`
  return COLORS[colorKey] ?? COLORS.gray
}

// Neutral default for freshly created cards; duplicates keep their source's color.
export const DEFAULT_COLOR = 'gray'

// Any card or group can optionally also be a task — `taskStatus` is
// undefined for a plain (non-task) entity, and one of these four once it's
// been made one via the selection menu's Default/Task section.
export const TASK_STATUSES = ['todo', 'blocked', 'in_progress', 'done']
export const DEFAULT_TASK_STATUS = 'todo'

// Task-status colors are a separate, fixed palette from COLORS above (which
// is for the card/group's own accent). All four are chosen for contrast
// against the small status glyph's background (the bar/handle strip), not
// for subtlety — unlike COLORS.gray/GRAY_LIGHT, which are deliberately
// *low*-contrast against their theme (see the comment above GRAY_LIGHT),
// exactly wrong for a glyph that needs to actually read at a glance.
// "to do" is still a plain neutral gray, just the higher-contrast one for
// each theme instead of the quiet default-color one; the other three are
// fixed and read unambiguously as their semantic meaning (red/blue/green).
export function resolveTaskStatusColor(status, theme) {
  switch (status) {
    case 'blocked':
      return '#bf616a' // nord11
    case 'in_progress':
      return '#5e81ac' // nord10
    case 'done':
      return '#a3be8c' // nord14
    default:
      return theme === 'light' ? '#4c566a' /* nord3 */ : '#d8dee9' /* nord4 */
  }
}

// Recency-mode border color (viz > recency) — four gradations from "just
// updated" to "stale", reusing the matching COLORS entries (so they're the
// same swatches offered in the picker, not one-off hexes) rather than a
// dedicated palette like resolveTaskStatusColor's.
const RECENCY_THRESHOLDS_MS = {
  green: 24 * 60 * 60 * 1000, // last day
  yellow: 7 * 24 * 60 * 60 * 1000, // last week
  orange: 30 * 24 * 60 * 60 * 1000, // last month
  // anything older falls through to red
}

export function resolveRecencyColor(updatedAt, theme) {
  const elapsed = Date.now() - new Date(updatedAt).getTime()
  if (elapsed <= RECENCY_THRESHOLDS_MS.green) return resolveColor('lime', theme)
  if (elapsed <= RECENCY_THRESHOLDS_MS.yellow) return resolveColor('amber', theme)
  if (elapsed <= RECENCY_THRESHOLDS_MS.orange) return resolveColor('orange', theme)
  return resolveColor('coral', theme)
}

// Matches the dot-matrix background pitch in index.css. Cards snap to the
// midpoints between dots (offset by half a cell) rather than onto the dots
// themselves, so corners land in the gaps of the dot matrix.
export const GRID_SIZE = 16
const GRID_OFFSET = GRID_SIZE / 2

export function snapToGrid(value) {
  return Math.round((value - GRID_OFFSET) / GRID_SIZE) * GRID_SIZE + GRID_OFFSET
}

// All cards share one fixed width, a multiple of GRID_SIZE, so the left and
// right edges both land on grid midpoints. Kept close to its prior 220px
// value even though GRID_SIZE shrank.
export const CARD_WIDTH = GRID_SIZE * 14

// A regular card's height grows with content, so it's not in the data model
// at all — this is only a rough stand-in for placement heuristics (keeping
// a freshly created or pasted card clear of a group's no-fly zone, or clear
// of groups entirely on paste) that need *some* height before anything has
// ever been rendered to measure.
export const NEW_CARD_HEIGHT_ESTIMATE = 90

// Text size is a per-card attribute, not a separate node type. 'regular' is
// the normal note: fixed width, height grows with content. 'big' is a
// freeform box — resizable in any direction like a group, with a large
// font, that truncates instead of scrolling when content overflows it.
export const DEFAULT_TEXT_SIZE = 'regular'
export const BIG_TEXT_MIN_W = GRID_SIZE * 10
export const BIG_TEXT_MIN_H = GRID_SIZE * 6
export const BIG_TEXT_DEFAULT_W = GRID_SIZE * 16
export const BIG_TEXT_DEFAULT_H = GRID_SIZE * 8

// Grouping boxes: freeform rectangles cards can be arranged over. Always
// rendered beneath cards (see Board.jsx render order) and, unlike cards,
// resized directly by dragging their border.
export const GROUP_MIN_W = GRID_SIZE * 8
export const GROUP_MIN_H = GRID_SIZE * 6
// Matches DEFAULT_COLOR (cards) — a fresh group shouldn't stand out with an
// arbitrary accent color before the user's actually picked one.
export const DEFAULT_GROUP_COLOR = 'gray'

// Cards have varying heights (text, later images), so vertical position
// doesn't snap to the dot grid the way horizontal position does. Instead,
// when a drop lands within two grid cells of a neighboring card's edge,
// it snaps to a fixed gutter from that edge, keeping vertical spacing
// visually consistent regardless of content height.
export const Y_SNAP_THRESHOLD = GRID_SIZE * 2
export const Y_SNAP_GUTTER = GRID_SIZE

let uid = 0
export function nextId(prefix) {
  uid += 1
  return `${prefix}${Date.now().toString(36)}${uid}`
}

// createdAt/updatedAt are stored as ISO strings (not epoch ms) on every
// card, group, and edge — readable in a raw JSON diff/export, unlike a
// number. useBoard.js is responsible for refreshing updatedAt on every
// mutation to an existing entity, and for backfilling both fields on any
// legacy saved board that predates them (see loadInitialBoard).
export function nowISO() {
  return new Date().toISOString()
}

// Connections between two nodes (cards or groups). Direction picks which
// end (if either) gets an arrowhead: 'forward' points toId-ward, 'backward'
// points fromId-ward, 'none' is a plain line. fromSide/toSide are which of
// the node's 4 sides the connection attaches to — chosen once by the user
// when drawing it and fixed from then on (Board.jsx never recomputes them),
// so the line can deliberately bend around rather than always taking the
// shortest path.
export const DEFAULT_EDGE_DIRECTION = 'none'
// Edges aren't user-colorable — they're always this one fixed neutral tone
// (nord3, same as COLORS.gray and the pattern tint), which reads clearly
// enough against any card/group color or a (always-neutral) pattern
// background on its own.
export const EDGE_COLOR = COLORS.gray

// The whole app state is this one JSON structure. Used only when localStorage
// has no saved board yet (see useBoard.js) — a single starter note, not a
// demo/tour board, since there's no "reset" affordance to get back to a
// clean slate anymore.
//
// `images` is deliberately the *last* key, and every board-mutating action
// in useBoard.js is written to preserve that ordering: a card with a
// picture references it by `imageId` rather than embedding the data URI
// inline, and the actual (large, unreadable-as-a-diff) base64 blobs all
// live together in `images`, keyed by that id. That keeps the "nodes"
// section of the JSON — the part worth actually reading in a diff — free of
// giant base64 strings, with all of that noise pushed to the end instead.
const SEED_TIMESTAMP = nowISO()

export const seedBoard = {
  groups: [],
  edges: [],
  cards: [
    {
      id: 'c1',
      x: snapToGrid(80),
      y: snapToGrid(100),
      w: CARD_WIDTH,
      color: 'amber',
      content: 'Welcome to Kanvy\n\nDouble-click the canvas to add a note.',
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP,
    },
  ],
  images: {},
}

export function newCard({
  x,
  y,
  color = DEFAULT_COLOR,
  textSize = DEFAULT_TEXT_SIZE,
  content = '',
  imageId,
  linkUrl,
  linkTitle,
  linkImageUrl,
  linkStatus,
} = {}) {
  const timestamp = nowISO()
  return {
    id: nextId('c'),
    x: snapToGrid(x ?? 120),
    y: snapToGrid(y ?? 120),
    w: CARD_WIDTH,
    color,
    textSize,
    content,
    imageId,
    // A link node's fetched-metadata fields — 'loading' until the
    // microlink.io request resolves, then 'ready' (title/image populated,
    // either of which may still be missing) or 'error' (neither populated).
    linkUrl,
    linkTitle,
    linkImageUrl,
    linkStatus,
    // Task status is toggled after creation via the selection menu's
    // Default/Task section (Board.jsx) — undefined here means "not a task".
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function newGroup({ x, y, w, h, color = DEFAULT_GROUP_COLOR, pattern = DEFAULT_PATTERN } = {}) {
  const timestamp = nowISO()
  return {
    id: nextId('g'),
    x: snapToGrid(x ?? 120),
    y: snapToGrid(y ?? 120),
    w: Math.max(GROUP_MIN_W, w ?? GROUP_MIN_W),
    h: Math.max(GROUP_MIN_H, h ?? GROUP_MIN_H),
    color,
    pattern,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function newEdge({ fromId, fromSide, toId, toSide, direction = DEFAULT_EDGE_DIRECTION } = {}) {
  const timestamp = nowISO()
  return { id: nextId('e'), fromId, fromSide, toId, toSide, direction, createdAt: timestamp, updatedAt: timestamp }
}
