#!/usr/bin/env node
// Converts a schema v7 Kanvy board document (the app's JSON shape — a
// localStorage export or json-server's db.json) into SQL inserts for the
// `app_data` Postgres schema in ctx/support/261020-pg-schema.sql.
//
// Usage:
//   node ctx/support/json-to-pg-sql.mjs board-v7.json > kanvy-data.sql
//
// Reads the document from the given file and prints SQL to stdout. Exits 1
// with a message on stderr (and prints nothing) if the path is missing or
// unreadable, the file isn't JSON, or the document isn't a valid v7 board —
// a v6 document can be brought up to v7 first with migrate-v6-to-v7.mjs.
//
// Dependency-free and standalone (no imports from src/), like
// migrate-v6-to-v7.mjs. The validation below mirrors src/schema/*.ts's Zod
// schemas, plus checks Zod doesn't make but the database needs: unique ids,
// resolvable references (boardId, fromNodeId/toNodeId, imageId, boardRef),
// parseable timestamps, no NUL characters in text. Stricter than Zod in one
// way: unknown keys are rejected rather than stripped, so no data is
// silently dropped on the way into Postgres.
//
// Postgres assigns every row a fresh uuid (the tables' gen_random_uuid()
// defaults). App ids are mapped to their new uuids through a temp table,
// `kanvy_id_map`, which is dropped at commit. The output is one
// transaction; it only inserts (it doesn't truncate), so loading it into a
// database that already has a root board leaves two `is_root` boards.

import { readFileSync } from 'node:fs'

const SCHEMA_VERSION = 7

const STATUS = ['active', 'trashed']
const COLORS = [
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
const PATTERNS = [
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
const TASKS = ['none', 'todo', 'blocked', 'in_progress', 'done']
const TEXT_SIZES = ['regular', 'h1', 'h2', 'h3']
const SIDES = ['top', 'right', 'bottom', 'left']
const DIRECTIONS = ['none', 'forward', 'backward']

// --- validation ------------------------------------------------------------

// Field validators: each returns an error message, or null when valid.
const str = (v) => (typeof v === 'string' ? null : 'expected a string')
const nullableStr = (v) =>
  v === null || typeof v === 'string' ? null : 'expected a string or null'
const num = (v) =>
  typeof v === 'number' && Number.isFinite(v) ? null : 'expected a number'
const bool = (v) => (typeof v === 'boolean' ? null : 'expected a boolean')
const oneOf = (options) => (v) =>
  options.includes(v)
    ? null
    : `expected one of ${options.map((o) => JSON.stringify(o)).join(', ')}`
const timestamp = (v) =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v))
    ? null
    : 'expected an ISO timestamp string'

const BOARD_FIELDS = {
  id: str,
  title: str,
  status: oneOf(STATUS),
  isRoot: bool,
  createdAt: timestamp,
  updatedAt: timestamp,
}

const IMAGE_FIELDS = { id: str, dataUri: str }

const EDGE_FIELDS = {
  id: str,
  boardId: str,
  fromNodeId: str,
  fromSide: oneOf(SIDES),
  toNodeId: str,
  toSide: oneOf(SIDES),
  direction: oneOf(DIRECTIONS),
  status: oneOf(STATUS),
  createdAt: timestamp,
  updatedAt: timestamp,
}

const NODE_BASE_FIELDS = {
  id: str,
  boardId: str,
  x: num,
  y: num,
  w: num,
  h: num,
  color: oneOf(COLORS),
  task: oneOf(TASKS),
  status: oneOf(STATUS),
  position: num,
  createdAt: timestamp,
  updatedAt: timestamp,
}

const CARD_BASE_FIELDS = {
  ...NODE_BASE_FIELDS,
  nodeType: oneOf(['card']),
  content: str,
}

const CARD_FIELDS = {
  text: { ...CARD_BASE_FIELDS, cardType: str, size: oneOf(TEXT_SIZES) },
  image: { ...CARD_BASE_FIELDS, cardType: str, imageId: str },
  link: {
    ...CARD_BASE_FIELDS,
    cardType: str,
    linkUrl: str,
    linkTitle: nullableStr,
    linkImageUrl: nullableStr,
  },
  board: { ...CARD_BASE_FIELDS, cardType: str, boardRef: str },
}

const CONTAINER_FIELDS = {
  ...NODE_BASE_FIELDS,
  nodeType: str,
  pattern: oneOf(PATTERNS),
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Every problem with `value` against `fields` (exact key set), prefixed by `path`. */
function fieldIssues(value, fields, path) {
  if (!isRecord(value)) return [`${path}: expected an object`]
  const issues = []
  for (const [key, check] of Object.entries(fields)) {
    if (!(key in value)) {
      issues.push(`${path}.${key}: missing`)
      continue
    }
    const problem = check(value[key])
    if (problem) issues.push(`${path}.${key}: ${problem}`)
  }
  for (const key of Object.keys(value)) {
    if (!(key in fields)) issues.push(`${path}.${key}: unknown key`)
  }
  return issues
}

function nodeFields(node) {
  if (!isRecord(node)) return null
  if (node.nodeType === 'container') return CONTAINER_FIELDS
  if (node.nodeType === 'card') return CARD_FIELDS[node.cardType] ?? null
  return null
}

function nodeIssues(node, path) {
  const fields = nodeFields(node)
  if (fields) return fieldIssues(node, fields, path)
  if (!isRecord(node)) return [`${path}: expected an object`]
  if (node.nodeType === 'card') {
    return [
      `${path}.cardType: expected one of ${Object.keys(CARD_FIELDS).join(', ')}, got ${JSON.stringify(node.cardType)}`,
    ]
  }
  return [
    `${path}.nodeType: expected "card" or "container", got ${JSON.stringify(node.nodeType)}`,
  ]
}

function collectionIssues(document, key, entryIssues) {
  const entries = document[key]
  if (!Array.isArray(entries)) return [`${key}: expected an array`]
  return entries.flatMap((entry, i) => entryIssues(entry, `${key}[${i}]`))
}

function duplicateIdIssues(entries, key) {
  const seen = new Set()
  const issues = []
  for (const { id } of entries) {
    if (seen.has(id)) issues.push(`${key}: duplicate id ${JSON.stringify(id)}`)
    seen.add(id)
  }
  return issues
}

// Same invariant (and wording) as src/schema/boardMeta.ts's rootBoardIssues.
function rootBoardIssues(boards) {
  const roots = boards.filter((board) => board.isRoot)
  if (roots.length === 0) {
    return ['boards: no board has isRoot: true — exactly one root board is required']
  }
  if (roots.length > 1) {
    const ids = roots.map((board) => `"${board.id}"`).join(', ')
    return [
      `boards: ${roots.length} boards have isRoot: true (${ids}) — exactly one root board is allowed`,
    ]
  }
  if (roots[0].status === 'trashed') {
    return [
      `boards: root board "${roots[0].id}" is trashed — the root board must be active`,
    ]
  }
  return []
}

function referenceIssues({ boards, nodes, edges, images }) {
  const boardIds = new Set(boards.map((b) => b.id))
  const nodeIds = new Set(nodes.map((n) => n.id))
  const imageIds = new Set(images.map((i) => i.id))
  const issues = []
  const check = (ids, value, path, target) => {
    if (!ids.has(value)) {
      issues.push(`${path}: ${JSON.stringify(value)} is not a ${target} id`)
    }
  }
  nodes.forEach((node, i) => {
    check(boardIds, node.boardId, `nodes[${i}].boardId`, 'board')
    if ('imageId' in node) {
      check(imageIds, node.imageId, `nodes[${i}].imageId`, 'image')
    }
    if ('boardRef' in node) {
      check(boardIds, node.boardRef, `nodes[${i}].boardRef`, 'board')
    }
  })
  edges.forEach((edge, i) => {
    check(boardIds, edge.boardId, `edges[${i}].boardId`, 'board')
    check(nodeIds, edge.fromNodeId, `edges[${i}].fromNodeId`, 'node')
    check(nodeIds, edge.toNodeId, `edges[${i}].toNodeId`, 'node')
  })
  return issues
}

// Postgres text can't hold U+0000; it would fail mid-load, so catch it here.
function nulCharIssues(document) {
  const issues = []
  for (const key of ['boards', 'nodes', 'edges', 'images']) {
    document[key].forEach((entry, i) => {
      for (const [field, value] of Object.entries(entry)) {
        if (typeof value === 'string' && value.includes('\u0000')) {
          issues.push(`${key}[${i}].${field}: contains a NUL character`)
        }
      }
    })
  }
  return issues
}

const TOP_LEVEL_KEYS = ['version', 'nodes', 'edges', 'boards', 'images']

function documentIssues(document) {
  if (!isRecord(document)) return ['expected a JSON object at the top level']
  // json-server's db.json has no `version` key -- the strict shape checks
  // below still reject an older shape, so only a wrong version bails here.
  if ('version' in document && document.version !== SCHEMA_VERSION) {
    return [
      `expected a v${SCHEMA_VERSION} document (top-level "version": ${SCHEMA_VERSION}), got version ${JSON.stringify(document.version)}`,
    ]
  }
  const shapeIssues = [
    ...Object.keys(document)
      .filter((key) => !TOP_LEVEL_KEYS.includes(key))
      .map((key) => `${key}: unknown top-level key`),
    ...collectionIssues(document, 'boards', (b, p) =>
      fieldIssues(b, BOARD_FIELDS, p),
    ),
    ...collectionIssues(document, 'nodes', nodeIssues),
    ...collectionIssues(document, 'edges', (e, p) =>
      fieldIssues(e, EDGE_FIELDS, p),
    ),
    ...collectionIssues(document, 'images', (img, p) =>
      fieldIssues(img, IMAGE_FIELDS, p),
    ),
  ]
  // Cross-entity checks assume well-shaped entries.
  if (shapeIssues.length > 0) return shapeIssues
  return [
    ...duplicateIdIssues(document.boards, 'boards'),
    ...duplicateIdIssues(document.nodes, 'nodes'),
    ...duplicateIdIssues(document.edges, 'edges'),
    ...duplicateIdIssues(document.images, 'images'),
    ...rootBoardIssues(document.boards),
    ...referenceIssues(document),
    ...nulCharIssues(document),
  ]
}

// --- SQL generation --------------------------------------------------------

function literal(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  return `'${value.replaceAll("'", "''")}'`
}

/** The new uuid Postgres assigned to the `kind` entity with app id `appId`. */
function newId(kind, appId) {
  return `(select id from kanvy_id_map where kind = ${literal(kind)} and app_id = ${literal(appId)})`
}

function insert(table, columns, rows) {
  if (rows.length === 0) return `-- no ${table} rows\n`
  const values = rows.map((row) => `  (${row.join(', ')})`).join(',\n')
  return `insert into ${table} (${columns.join(', ')}) values\n${values};\n`
}

function boardRow(board) {
  return [
    newId('board', board.id),
    literal(board.title),
    literal(board.status),
    literal(board.isRoot),
    literal(board.createdAt),
    literal(board.updatedAt),
  ]
}

function imageRow(image) {
  return [newId('image', image.id), literal(image.dataUri)]
}

function nodeRow(node) {
  const ref = (kind, appId) =>
    appId === undefined ? 'null' : newId(kind, appId)
  return [
    newId('node', node.id),
    newId('board', node.boardId),
    literal(node.status),
    literal(node.color),
    literal(node.x),
    literal(node.y),
    literal(node.w),
    literal(node.h),
    literal(node.position),
    literal(node.task),
    literal(node.createdAt),
    literal(node.updatedAt),
    literal(node.nodeType),
    literal(node.content),
    literal(node.cardType),
    literal(node.size),
    literal(node.pattern),
    ref('image', node.imageId),
    literal(node.linkUrl),
    literal(node.linkTitle),
    literal(node.linkImageUrl),
    ref('board', node.boardRef),
  ]
}

function edgeRow(edge) {
  return [
    newId('edge', edge.id),
    newId('board', edge.boardId),
    newId('node', edge.fromNodeId),
    literal(edge.fromSide),
    newId('node', edge.toNodeId),
    literal(edge.toSide),
    literal(edge.direction),
    literal(edge.status),
    literal(edge.createdAt),
    literal(edge.updatedAt),
  ]
}

function toSql({ boards, nodes, edges, images }) {
  const idRows = [
    ...boards.map((b) => [literal('board'), literal(b.id)]),
    ...images.map((i) => [literal('image'), literal(i.id)]),
    ...nodes.map((n) => [literal('node'), literal(n.id)]),
    ...edges.map((e) => [literal('edge'), literal(e.id)]),
  ]
  return [
    `-- Kanvy v${SCHEMA_VERSION} document → app_data, generated by ctx/support/json-to-pg-sql.mjs.`,
    `-- ${boards.length} boards, ${images.length} images, ${nodes.length} nodes, ${edges.length} edges.\n`,
    'begin;\n',
    '-- App id → new uuid, assigned by Postgres. Dropped at commit.',
    'create temp table kanvy_id_map (',
    '  kind text not null,',
    '  app_id text not null,',
    '  id uuid not null default gen_random_uuid(),',
    '  primary key (kind, app_id)',
    ') on commit drop;\n',
    insert('kanvy_id_map', ['kind', 'app_id'], idRows),
    insert(
      'app_data.boards',
      ['id', 'title', 'status', 'is_root', 'created_at', 'updated_at'],
      boards.map(boardRow),
    ),
    insert('app_data.images', ['id', 'data_uri'], images.map(imageRow)),
    insert(
      'app_data.nodes',
      [
        'id',
        'board_id',
        'status',
        'color',
        'x',
        'y',
        'w',
        'h',
        'position',
        'task',
        'created_at',
        'updated_at',
        'node_type',
        'content',
        'card_type',
        'size',
        'pattern',
        'image_id',
        'link_url',
        'link_title',
        'link_image_url',
        'board_ref',
      ],
      nodes.map(nodeRow),
    ),
    insert(
      'app_data.edges',
      [
        'id',
        'board_id',
        'from_node_id',
        'from_side',
        'to_node_id',
        'to_side',
        'direction',
        'status',
        'created_at',
        'updated_at',
      ],
      edges.map(edgeRow),
    ),
    'commit;',
  ].join('\n')
}

function main(argv) {
  const [path] = argv
  if (path === undefined) {
    process.stderr.write(
      'usage: node ctx/support/json-to-pg-sql.mjs <v7-document.json>\n',
    )
    return 1
  }
  try {
    const document = JSON.parse(readFileSync(path, 'utf8'))
    const issues = documentIssues(document)
    if (issues.length > 0) {
      process.stderr.write(
        `json-to-pg-sql: not a valid v${SCHEMA_VERSION} document:\n${issues.map((i) => `  ${i}`).join('\n')}\n`,
      )
      return 1
    }
    process.stdout.write(`${toSql(document)}\n`)
    return 0
  } catch (error) {
    process.stderr.write(`json-to-pg-sql: ${error.message}\n`)
    return 1
  }
}

process.exitCode = main(process.argv.slice(2))
