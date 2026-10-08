// Regenerates server/db.json from this app's own schema/types — the
// sample document for `pnpm dev:server` (json-server) should never be
// hand-edited for its *shape*, only ever produced by this script, so it
// can't silently drift from a schema change the way a hand-maintained
// JSON fixture would. Two layers of protection against drift:
//
//   1. Every entity below is typed against the real `Node`/`Edge`/
//      `BoardMeta`/`ImageEntry` types (src/schema/*) — a breaking schema
//      change (a new required field, a renamed one) fails this file at
//      typecheck time (`pnpm typecheck`, which covers `server/` — see
//      tsconfig.node.json), not silently.
//   2. The assembled document is also validated against `BoardSchema` at
//      generation time — a real runtime check, independent of whether
//      typecheck happened to run, catching anything types alone can't
//      (Zod refinements, discriminated-union validity).
//
// The document is a *design-review fixture*: it lays out every persisted
// node state the app can render — every kind, heading size, accent color,
// task status, recency band, link status, container pattern, edge
// direction — as labeled rows on one showcase board per topic, linked from
// the home board. Load it, then flip theme (light/dark) and view mode
// (standard/task/recency) to see each state under every lens. Transient
// interaction states (hover, selected, editing) aren't data — exercise
// them live on any card. Mirrors the matrix in
// ctx/support/261007-card-states-design-updates-file.html, whose two
// sample images (server/fixtures/*.png) it reuses.
//
// Timestamps are relative to generation time (recency bands, spec §6.3),
// so recency mode drifts as the file ages — `--force` regenerates.
//
// Run with `pnpm db:init` (only writes if server/db.json doesn't already
// exist — won't clobber whatever a live dev session's json-server has
// since mutated) or `pnpm db:init -- --force` (always overwrites).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ImageEntry } from '../src/schema/board.ts'
import { BoardSchema, SCHEMA_VERSION } from '../src/schema/board.ts'
import type { BoardMeta } from '../src/schema/boardMeta.ts'
import type { Edge, EdgeDirection } from '../src/schema/edge.ts'
import type {
  ColorKey,
  Node,
  PatternKey,
  TaskField,
  TaskStatus,
} from '../src/schema/node.ts'

const OUT_PATH = fileURLToPath(new URL('./db.json', import.meta.url))
// The root board is designated by `isRoot`, not by its id (schema v6,
// ctx/notes/261006-root-board-isroot.md) — this is just a fixed id in
// the shape `generateId()` produces (12 chars, lowercase alphanumeric),
// so regenerations stay diffable.
const ROOT_BOARD_ID = 'h0me0b0ard00'

// ---------- time ----------

const GENERATED_AT = Date.now()
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

function ago(ms: number): string {
  return new Date(GENERATED_AT - ms).toISOString()
}

// Nodes without an explicit age cycle through one representative age per
// recency band (≤1d lime, ≤1w amber, ≤1mo orange, older coral), so
// recency mode shows a spread on every board, not only the recency one.
const AGE_CYCLE = [10 * MINUTE, 3 * DAY, 2 * WEEK, 90 * DAY]

// ---------- images ----------

function pngDataUri(name: string): string {
  const bytes = readFileSync(new URL(`./fixtures/${name}`, import.meta.url))
  return `data:image/png;base64,${bytes.toString('base64')}`
}

const LANDSCAPE = pngDataUri('landscape.png') // 448×280
const SMALL = pngDataUri('small.png') // 96×72 — narrower than CARD_WIDTH
const images: ImageEntry[] = [
  { id: 'img-landscape', dataUri: LANDSCAPE },
  { id: 'img-small', dataUri: SMALL },
]

// ---------- node drafts ----------

const ALL_COLORS: ColorKey[] = [
  'gray',
  'coral',
  'orange',
  'amber',
  'lime',
  'teal',
  'sky',
  'violet',
  'pink',
]
const ALL_PATTERNS: PatternKey[] = [
  'none',
  'falling-triangles',
  'leaf',
  'wiggle',
  'plus',
  'lines-in-motion',
  'topography',
  'rain',
  'squares',
]
const ALL_STATUSES: TaskStatus[] = ['todo', 'blocked', 'in_progress', 'done']

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never

// Everything about a node except where it lands and its bookkeeping —
// the board builder below assigns those.
type Draft = DistributiveOmit<
  Node,
  | 'id'
  | 'boardId'
  | 'position'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
  | 'x'
  | 'y'
> & { age?: number }

interface Common {
  color?: ColorKey
  task?: TaskField
  age?: number
}

function common({ color = 'gray', task = 'none', age }: Common) {
  return {
    color,
    task,
    ...(age === undefined ? {} : { age }),
  }
}

// Rough rendered height of a caption — the real height is measured and
// persisted on first render; this only keeps rows from overlapping
// before then (~28 monospace chars per line at CARD_WIDTH, ~17px each).
function captionHeight(content: string): number {
  if (!content) return 0
  const lines = content
    .split('\n')
    .reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 28)), 0)
  return 24 + lines * 17
}

function text(content: string, opts: Common = {}): Draft {
  return {
    nodeType: 'card',
    cardType: 'text',
    size: 'regular',
    content,
    w: 224,
    h: Math.max(90, 17 + captionHeight(content)),
    ...common(opts),
  }
}

const HEADING_BOX = {
  h1: { w: 352, h: 96 },
  h2: { w: 256, h: 80 },
  h3: { w: 256, h: 80 },
} as const

function heading(
  size: 'h1' | 'h2' | 'h3',
  content: string,
  opts: Common & { w?: number; h?: number } = {},
): Draft {
  return {
    nodeType: 'card',
    cardType: 'text',
    size,
    content,
    w: opts.w ?? HEADING_BOX[size].w,
    h: opts.h ?? HEADING_BOX[size].h,
    ...common(opts),
  }
}

function image(
  which: 'landscape' | 'small',
  caption = '',
  opts: Common = {},
): Draft {
  return {
    nodeType: 'card',
    cardType: 'image',
    imageId: `img-${which}`,
    content: caption,
    w: 224,
    // newImageCard's sizing (CARD_WIDTH / aspect ratio); the real
    // rendered height is measured and persisted on first render.
    h: (which === 'landscape' ? 140 : 168) + captionHeight(caption),
    ...common(opts),
  }
}

interface LinkOpts extends Common {
  status?: 'loading' | 'ready' | 'error'
  title?: string
  withImage?: boolean
  url?: string
  caption?: string
}

function linkMeta({ status = 'ready', title, withImage, url }: LinkOpts) {
  return {
    url: url ?? 'https://example.com/some/article',
    status,
    ...(title === undefined ? {} : { title }),
    ...(withImage ? { imageUrl: LANDSCAPE } : {}),
  }
}

function link(opts: LinkOpts = {}): Draft {
  return {
    nodeType: 'card',
    cardType: 'link',
    link: linkMeta(opts),
    content: opts.caption ?? '',
    w: 224,
    h: (opts.withImage ? 200 : 90) + captionHeight(opts.caption ?? ''),
    ...common(opts),
  }
}

function container(
  pattern: PatternKey,
  opts: Common & { w?: number; h?: number } = {},
): Draft {
  return {
    nodeType: 'container',
    pattern,
    w: opts.w ?? 320,
    h: opts.h ?? 224,
    ...common(opts),
  }
}

function boardCard(boardRef: string, opts: Common = {}): Draft {
  return {
    nodeType: 'card',
    cardType: 'board',
    boardRef,
    content: '',
    w: 224,
    h: 90,
    ...common(opts),
  }
}

// ---------- layout ----------

// A cell is a cluster of nodes positioned relative to its own origin, plus
// edges between them by local ref — most cells are one node; containers
// with contents and edge demos are several.
interface Item {
  draft: Draft
  dx?: number
  dy?: number
  ref?: string
}
interface CellEdge {
  from: [ref: string, side: Edge['fromSide']]
  to: [ref: string, side: Edge['toSide']]
  direction: EdgeDirection
}
interface Cell {
  items: Item[]
  edges?: CellEdge[]
}
interface Row {
  label: string
  cells: (Draft | Cell)[]
}

const GRID = 16
// Grid-midpoint aligned (≡ GRID/2 mod GRID, spec §3), like a snapped node.
const ORIGIN = 104 // first row's top-left, clear of the breadcrumb
const GAP = 32
const LABEL_H = HEADING_BOX.h3.h

function asCell(cell: Draft | Cell): Cell {
  return 'items' in cell ? cell : { items: [{ draft: cell }] }
}

function cellSize(cell: Cell): { w: number; h: number } {
  let w = 0
  let h = 0
  for (const { draft, dx = 0, dy = 0 } of cell.items) {
    w = Math.max(w, dx + draft.w)
    h = Math.max(h, dy + draft.h)
  }
  return { w, h }
}

const boards: BoardMeta[] = []
const nodes: Node[] = []
const edges: Edge[] = []
let ageCursor = 0

function addBoard(id: string, title: string, isRoot = false): void {
  boards.push({
    id,
    title,
    status: 'active',
    isRoot,
    createdAt: ago(30 * DAY),
    updatedAt: ago(DAY),
  })
}

function makeNodeFactory(boardId: string) {
  let index = 0
  return (draft: Draft, x: number, y: number): string => {
    const { age: explicitAge, ...rest } = draft
    const age = explicitAge ?? AGE_CYCLE[ageCursor++ % AGE_CYCLE.length] ?? 0
    const id = `${boardId}-n${index}`
    nodes.push({
      ...rest,
      id,
      boardId,
      x,
      y,
      status: 'active',
      position: index++,
      createdAt: ago(age + DAY),
      updatedAt: ago(age),
    } as Node)
    return id
  }
}

function placeCell(
  boardId: string,
  place: ReturnType<typeof makeNodeFactory>,
  cell: Cell,
  x: number,
  y: number,
): void {
  const ids = new Map<string, string>()
  for (const { draft, dx = 0, dy = 0, ref = '' } of cell.items) {
    ids.set(ref, place(draft, x + dx, y + dy))
  }
  for (const edge of cell.edges ?? []) addEdge(boardId, ids, edge)
}

function addEdge(
  boardId: string,
  ids: Map<string, string>,
  { from, to, direction }: CellEdge,
): void {
  const idFor = (ref: string): string => {
    const id = ids.get(ref)
    if (!id) throw new Error(`edge references unknown cell ref "${ref}"`)
    return id
  }
  edges.push({
    id: `${boardId}-e${edges.length}`,
    boardId,
    fromNodeId: idFor(from[0]),
    fromSide: from[1],
    toNodeId: idFor(to[0]),
    toSide: to[1],
    direction,
    status: 'active',
    createdAt: ago(DAY),
    updatedAt: ago(10 * MINUTE),
  })
}

/** Lays `rows` out top-to-bottom, each under its own h3 label card. */
function layoutBoard(boardId: string, rows: Row[]): void {
  const place = makeNodeFactory(boardId)
  let y = ORIGIN
  for (const row of rows) {
    place(heading('h3', row.label, { w: 640, age: 0 }), ORIGIN, y)
    y += LABEL_H + GAP / 2
    let x = ORIGIN
    let rowH = 0
    for (const raw of row.cells) {
      const cell = asCell(raw)
      const size = cellSize(cell)
      placeCell(boardId, place, cell, x, y)
      x += size.w + GAP
      rowH = Math.max(rowH, size.h)
    }
    // Regular cards grow to their content at runtime; leave headroom, and
    // keep the next row on the grid (card heights aren't grid multiples).
    y += Math.ceil(rowH / GRID) * GRID + GAP * 3
  }
}

// ---------- showcase boards ----------

const LONG_TEXT =
  'A longer note that wraps across several lines, to show how a regular ' +
  'card grows to fit its content. Regular cards never clip — their ' +
  'height follows the text.'

function textRows(): Row[] {
  return [
    {
      label: 'regular',
      cells: [
        text('A short note.'),
        text(LONG_TEXT),
        text('Line one\nLine two\n\n- a\n- list'),
        text('🌱 emoji 🎉 render inline ✨'),
        text(''), // empty → placeholder
      ],
    },
    {
      label: 'headings',
      cells: [
        heading('h1', 'Heading 1'),
        heading('h2', 'Heading 2'),
        heading('h3', 'Heading 3'),
        heading('h2', ''), // empty → placeholder
        heading('h1', 'A heading too long for its box', { w: 256 }), // clipped
        heading('h1', 'Wide heading', { w: 512 }),
      ],
    },
    {
      label: 'tinted',
      cells: [
        text(LONG_TEXT, { color: 'coral' }),
        text('', { color: 'sky' }),
        heading('h1', 'Heading', { color: 'amber' }),
        heading('h2', 'Heading', { color: 'teal' }),
        heading('h3', 'Heading ✨', { color: 'violet' }),
        heading('h2', '', { color: 'pink' }),
      ],
    },
  ]
}

// One column per accent color, one row per kind/state.
function accentRows(): Row[] {
  const perColor = (make: (color: ColorKey) => Draft): Draft[] =>
    ALL_COLORS.map(make)
  return [
    { label: 'text', cells: perColor((c) => text(c, { color: c })) },
    {
      label: 'text · empty',
      cells: perColor((c) => text('', { color: c })),
    },
    {
      label: 'text · task in progress',
      cells: perColor((c) => text(c, { color: c, task: 'in_progress' })),
    },
    {
      label: 'text · task done',
      cells: perColor((c) => text(c, { color: c, task: 'done' })),
    },
    {
      label: 'heading',
      cells: perColor((c) => heading('h3', c, { color: c })),
    },
    {
      label: 'image · caption',
      cells: perColor((c) => image('landscape', c, { color: c })),
    },
    {
      label: 'image · done',
      cells: perColor((c) => image('landscape', c, { color: c, task: 'done' })),
    },
    {
      label: 'link',
      cells: perColor((c) =>
        link({ color: c, title: `${c} link`, withImage: true }),
      ),
    },
    {
      label: 'container',
      cells: perColor((c) => container('none', { color: c, w: 224, h: 160 })),
    },
  ]
}

// Columns: not a task, then each status — per kind, in gray (status shows
// only in the glyph, and in task view's tint) and in a chromatic own color
// (standard view tints by own color, glyph drawn in ink).
function taskRows(): Row[] {
  const statuses: (TaskStatus | undefined)[] = [undefined, ...ALL_STATUSES]
  const label = (s: TaskStatus | undefined) =>
    s?.replace('_', ' ') ?? 'not a task'
  const row = (
    name: string,
    make: (s: TaskStatus | undefined) => Draft,
  ): Row => ({
    label: name,
    cells: statuses.map(make),
  })
  return [
    row('text', (task) => text(label(task), task ? { task } : {})),
    row('text · own color violet', (task) =>
      text(label(task), { color: 'violet', ...(task ? { task } : {}) }),
    ),
    row('heading', (task) => heading('h3', label(task), task ? { task } : {})),
    row('image', (task) =>
      image('landscape', label(task), task ? { task } : {}),
    ),
    row('image · own color lime', (task) =>
      image('landscape', label(task), {
        color: 'lime',
        ...(task ? { task } : {}),
      }),
    ),
    row('link', (task) =>
      link({ title: label(task), withImage: true, ...(task ? { task } : {}) }),
    ),
    row('container · own color sky + pattern', (task) =>
      container('topography', {
        color: 'sky',
        w: 224,
        h: 160,
        ...(task ? { task } : {}),
      }),
    ),
  ]
}

const RECENCY_AGES: [string, number][] = [
  ['0 minutes', 0],
  ['45 minutes', 45 * MINUTE],
  ['6 hours', 6 * HOUR],
  ['3 days', 3 * DAY],
  ['2 weeks', 2 * WEEK],
  ['3 months', 90 * DAY],
  ['2 years', 730 * DAY],
]

// Recency ignores own color and task status entirely (spec §6.2).
function recencyRows(): Row[] {
  return RECENCY_AGES.map(([name, age]) => ({
    label: `updated ${name} ago`,
    cells: [
      text(name, { age }),
      text(`${name} · own color violet, blocked task`, {
        age,
        color: 'violet',
        task: 'blocked',
      }),
      heading('h3', name, { age }),
      image('landscape', '', { age }),
      link({ title: name, age }),
      container('wiggle', { age, color: 'teal', w: 224, h: 128 }),
    ],
  }))
}

function imageRows(): Row[] {
  return [
    {
      label: 'landscape',
      cells: [
        image('landscape'),
        image('landscape', 'Lake trip, day two'),
        image('landscape', LONG_TEXT),
      ],
    },
    {
      label: 'narrower than the card',
      cells: [image('small'), image('small', 'A small image')],
    },
    {
      label: 'tinted',
      cells: [
        image('landscape', 'sky', { color: 'sky' }),
        image('landscape', '', { color: 'coral' }),
        image('small', 'pink', { color: 'pink' }),
      ],
    },
    {
      label: 'done (duotone)',
      cells: [
        image('landscape', 'done', { task: 'done' }),
        image('landscape', 'done · lime', { color: 'lime', task: 'done' }),
        image('small', 'done · small', { task: 'done' }),
        image('landscape', '', { color: 'violet', task: 'done' }),
      ],
    },
  ]
}

function linkRows(): Row[] {
  return [
    {
      label: 'status',
      cells: [
        link({ status: 'loading' }),
        link({ status: 'error' }),
        link({ title: 'Ready, title only' }),
        link({}), // ready, no title → shows the URL
        link({ title: 'Ready, title + image', withImage: true }),
      ],
    },
    {
      label: 'content',
      cells: [
        link({
          title: 'With a caption',
          withImage: true,
          caption: 'My notes on this.',
        }),
        link({
          title: 'A very long link title that has to wrap onto several lines',
        }),
        link({
          url: 'https://example.com/a/very/long/path/that/keeps/going/and/going?with=query&params=too',
        }),
        link({ title: 'Caption, no image', caption: 'Worth reading later.' }),
      ],
    },
    {
      label: 'tinted',
      cells: [
        link({ color: 'coral', title: 'coral', withImage: true }),
        link({ color: 'teal', status: 'loading' }),
        link({ color: 'amber', status: 'error' }),
        link({ color: 'violet', title: 'violet', caption: 'caption' }),
      ],
    },
    {
      label: 'done',
      cells: [
        link({
          title: 'done',
          withImage: true,
          task: 'done',
          caption: 'caption',
        }),
        link({
          color: 'sky',
          title: 'done · sky',
          withImage: true,
          task: 'done',
        }),
      ],
    },
  ]
}

function inContainer(outer: Draft, ...inner: Draft[]): Cell {
  return {
    items: [
      { draft: outer },
      ...inner.map((draft, i) => ({ draft, dx: 32, dy: 48 + i * 112 })),
    ],
  }
}

function containerRows(): Row[] {
  return [
    {
      label: 'patterns · gray',
      cells: ALL_PATTERNS.map((p) => container(p)),
    },
    {
      label: 'patterns · tinted',
      cells: ALL_PATTERNS.map((p, i) =>
        container(p, { color: ALL_COLORS[(i % 8) + 1] ?? 'coral' }),
      ),
    },
    {
      label: 'with contents',
      cells: [
        inContainer(container('none', { color: 'sky' }), text('gray card')),
        inContainer(container('none'), text('tinted card', { color: 'coral' })),
        inContainer(
          container('leaf', { color: 'lime' }),
          text('same color', { color: 'lime' }),
        ),
        inContainer(
          container('plus', { color: 'violet' }),
          text('other color', { color: 'amber' }),
        ),
        {
          items: [
            { draft: container('rain', { color: 'teal', w: 400, h: 288 }) },
            { draft: container('none', { color: 'pink' }), dx: 48, dy: 32 },
            { draft: text('nested', { color: 'pink' }), dx: 88, dy: 96 },
          ],
        },
      ],
    },
    {
      label: 'tasks · own color orange + pattern',
      cells: [undefined, ...ALL_STATUSES].map((task) =>
        inContainer(
          container('squares', {
            color: 'orange',
            h: 192,
            ...(task ? { task } : {}),
          }),
          text(task?.replace('_', ' ') ?? 'not a task'),
        ),
      ),
    },
  ]
}

function edgePair(
  direction: EdgeDirection,
  a: Draft,
  b: Draft,
  vertical = false,
): Cell {
  return {
    items: [
      { draft: a, ref: 'a' },
      { draft: b, ref: 'b', dx: vertical ? 0 : 320, dy: vertical ? 192 : 0 },
    ],
    edges: [
      vertical
        ? { from: ['a', 'bottom'], to: ['b', 'top'], direction }
        : { from: ['a', 'right'], to: ['b', 'left'], direction },
    ],
  }
}

function edgeRows(): Row[] {
  return [
    {
      label: 'directions',
      cells: (['none', 'forward', 'backward'] as const).map((d) =>
        edgePair(d, text(d), text(d)),
      ),
    },
    {
      label: 'between tinted nodes',
      cells: [
        edgePair(
          'forward',
          text('coral', { color: 'coral' }),
          text('teal', { color: 'teal' }),
        ),
        edgePair(
          'backward',
          image('landscape', '', { color: 'sky' }),
          link({ color: 'amber', title: 'amber' }),
          true,
        ),
        edgePair(
          'forward',
          heading('h3', 'h3'),
          text('done', { color: 'lime', task: 'done' }),
          true,
        ),
      ],
    },
    {
      label: 'across a container',
      cells: [
        {
          items: [
            {
              draft: container('topography', {
                color: 'violet',
                w: 288,
                h: 192,
              }),
            },
            {
              draft: text('inside', { color: 'violet' }),
              dx: 32,
              dy: 64,
              ref: 'in',
            },
            { draft: text('outside'), dx: 400, dy: 64, ref: 'out' },
            {
              draft: text('below', { color: 'pink' }),
              dx: 32,
              dy: 288,
              ref: 'below',
            },
          ],
          edges: [
            {
              from: ['in', 'right'],
              to: ['out', 'left'],
              direction: 'forward',
            },
            { from: ['in', 'bottom'], to: ['below', 'top'], direction: 'none' },
            {
              from: ['out', 'bottom'],
              to: ['below', 'right'],
              direction: 'backward',
            },
          ],
        },
      ],
    },
  ]
}

const SHOWCASES: [
  id: string,
  title: string,
  rows: () => Row[],
  color: ColorKey,
][] = [
  ['b-text', 'Text & headings', textRows, 'gray'],
  ['b-accents', 'Accent palette', accentRows, 'pink'],
  ['b-tasks', 'Task states', taskRows, 'teal'],
  ['b-recency', 'Recency bands', recencyRows, 'amber'],
  ['b-images', 'Images', imageRows, 'sky'],
  ['b-links', 'Links', linkRows, 'violet'],
  ['b-containers', 'Containers', containerRows, 'lime'],
  ['b-edges', 'Edges', edgeRows, 'coral'],
]

// ---------- home board ----------

// Board cards can only live on the home board, and each one owns its
// board (deleting the card trashes it), so every board-card state gets its
// own small stub board.
function stubBoard(key: string, title: string): string {
  const id = `b-stub-${key}`
  addBoard(id, title)
  layoutBoard(id, [
    {
      label: 'stub board',
      cells: [text(`Exists to show a board card's "${key}" state on Home.`)],
    },
  ])
  return id
}

function homeRows(): Row[] {
  return [
    {
      label: 'review fixture',
      cells: [
        text(
          'Every persisted node state, one board per topic. Flip light/dark ' +
            'and view mode (standard / task / recency) to see each under ' +
            'every lens. Hover, select and edit any card for interaction ' +
            'states.',
          { age: 0 },
        ),
      ],
    },
    {
      label: 'showcase boards',
      cells: SHOWCASES.map(([id, , , color]) => boardCard(id, { color })),
    },
    {
      label: 'board card · accents',
      cells: ALL_COLORS.map((c) => boardCard(stubBoard(c, c), { color: c })),
    },
    {
      label: 'board card · tasks',
      cells: [
        ...ALL_STATUSES.map((s) =>
          boardCard(stubBoard(s, s.replace('_', ' ')), { task: s }),
        ),
        boardCard(stubBoard('done-tinted', 'done · lime'), {
          task: 'done',
          color: 'lime',
        }),
      ],
    },
    {
      label: 'board card · names',
      cells: [
        boardCard(stubBoard('untitled', '')),
        boardCard(
          stubBoard(
            'long-name',
            'A board with a name long enough that it cannot fit on one line',
          ),
        ),
        boardCard(stubBoard('emoji', '🗺️ Roadmap ✨')),
      ],
    },
  ]
}

addBoard(ROOT_BOARD_ID, 'Home', true)
for (const [id, title, rows] of SHOWCASES) {
  addBoard(id, title)
  layoutBoard(id, rows())
}
layoutBoard(ROOT_BOARD_ID, homeRows())

// ---------- validate + write ----------

const result = BoardSchema.safeParse({
  version: SCHEMA_VERSION,
  nodes,
  edges,
  boards,
  images,
})
if (!result.success) {
  console.error('Generated sample board failed BoardSchema validation:')
  console.error(JSON.stringify(result.error.issues, null, 2))
  process.exit(1)
}

const force = process.argv.includes('--force')
if (existsSync(OUT_PATH) && !force) {
  console.log(`${OUT_PATH} already exists — pass --force to overwrite it.`)
  process.exit(0)
}

writeFileSync(
  OUT_PATH,
  `${JSON.stringify({ boards, nodes, edges, images }, null, 2)}\n`,
)
console.log(
  `Wrote ${OUT_PATH} (${boards.length} boards, ${nodes.length} nodes, ${edges.length} edges)`,
)
