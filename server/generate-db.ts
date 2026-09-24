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
// Run with `pnpm db:init` (only writes if server/db.json doesn't already
// exist — won't clobber whatever a live dev session's json-server has
// since mutated) or `pnpm db:init -- --force` (always overwrites).

import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ImageEntry } from '../src/schema/board.ts'
import { BoardSchema, SCHEMA_VERSION } from '../src/schema/board.ts'
import type { BoardMeta } from '../src/schema/boardMeta.ts'
import { ROOT_BOARD_ID } from '../src/schema/boardMeta.ts'
import type { Edge } from '../src/schema/edge.ts'
import type { Node } from '../src/schema/node.ts'

const OUT_PATH = fileURLToPath(new URL('./db.json', import.meta.url))
const NOW = '2026-09-23T12:00:00.000Z'
const SAMPLE_BOARD_ID = 'b1'

// A 1x1 transparent PNG — small, real, decodable (not just a placeholder
// string), so anything that actually renders/decodes it (the app, an
// e2e spec) sees a valid image.
const PLACEHOLDER_IMAGE_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

const boards: BoardMeta[] = [
  {
    id: ROOT_BOARD_ID,
    title: 'Home',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: SAMPLE_BOARD_ID,
    title: 'Sample board',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  },
]

// One of every node kind (text/image/link/board-card + container), plus
// an edge connecting two of them — a reasonably complete fixture for
// exercising network mode's read/write path against every entity kind
// this app has.
const nodes: Node[] = [
  {
    id: 'n0',
    boardId: ROOT_BOARD_ID,
    type: 'card',
    kind: 'board',
    boardRef: SAMPLE_BOARD_ID,
    x: 88,
    y: 104,
    w: 224,
    h: 90,
    color: 'gray',
    status: 'active',
    index: 0,
    content: '',
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'n1',
    boardId: SAMPLE_BOARD_ID,
    type: 'card',
    kind: 'text',
    size: 'regular',
    x: 80,
    y: 100,
    w: 224,
    h: 90,
    color: 'amber',
    status: 'active',
    index: 0,
    content: 'A sample text card',
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'n2',
    boardId: SAMPLE_BOARD_ID,
    type: 'card',
    kind: 'image',
    imageId: 'img1',
    x: 400,
    y: 100,
    w: 224,
    h: 168,
    color: 'gray',
    status: 'active',
    index: 1,
    content: '',
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'n3',
    boardId: SAMPLE_BOARD_ID,
    type: 'container',
    pattern: 'none',
    x: 60,
    y: 320,
    w: 320,
    h: 220,
    color: 'sky',
    status: 'active',
    index: 2,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'n4',
    boardId: SAMPLE_BOARD_ID,
    type: 'card',
    kind: 'link',
    link: {
      url: 'https://example.com',
      title: 'Example',
      status: 'ready',
    },
    x: 400,
    y: 320,
    w: 224,
    h: 120,
    color: 'violet',
    status: 'active',
    index: 3,
    content: '',
    createdAt: NOW,
    updatedAt: NOW,
  },
]

const edges: Edge[] = [
  {
    id: 'e1',
    boardId: SAMPLE_BOARD_ID,
    fromNodeId: 'n1',
    fromSide: 'right',
    toNodeId: 'n2',
    toSide: 'left',
    direction: 'forward',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  },
]

const images: ImageEntry[] = [
  { id: 'img1', dataUri: PLACEHOLDER_IMAGE_DATA_URI },
]

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
console.log(`Wrote ${OUT_PATH}`)
