#!/usr/bin/env node
// Migrates a schema v6 Kanvy board document to schema v7.
//
// Usage:
//   node ctx/support/migrate-v6-to-v7.mjs '<v6 document JSON>'
//   node ctx/support/migrate-v6-to-v7.mjs "$(cat board-v6.json)" > board-v7.json
//
// Prints the v7 document to stdout (2-space JSON). Exits 1 with a message on
// stderr if the argument is missing, isn't JSON, or isn't a v6 document.
//
// Dependency-free and standalone (no imports from src/) on purpose: it's a
// one-shot data fixture for migrating exported/server data outside the app.
// It must stay in sync with every v6 → v7 change in src/schema/legacy.ts —
// src/schema/migrateV6ToV7Script.test.ts runs this script and asserts its
// output matches the app's own migration and validates against BoardSchema.
//
// v7 changes applied to every node (nothing else in the document changes):
//   - task: v6's optional `{ status }` wrapper becomes a required bare enum —
//     `{ status: s }` → `s`; absent, `null`, or a `{ status }`-less wrapper
//     → `'none'` (ctx/notes/261008-flat-task-status.md).
//   - index → position, same value, same key order
//     (ctx/notes/261008-position-rename.md).
//   - type → nodeType and kind → cardType, same values, same key order
//     (ctx/notes/261008-node-type-card-type-rename.md).

// v6 node key → v7 node key. Values carry over unchanged.
const NODE_KEY_RENAMES = new Map([
  ['index', 'position'],
  ['type', 'nodeType'],
  ['kind', 'cardType'],
])

const SOURCE_VERSION = 6
const TARGET_VERSION = 7

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function migrateTask(task) {
  if (isRecord(task) && typeof task.status === 'string') return task.status
  if (typeof task === 'string') return task
  return 'none'
}

/** Rebuilds `node` key by key so each renamed key lands where its old one was. */
function migrateNode(node) {
  if (!isRecord(node)) return node
  const migrated = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === 'task') migrated.task = migrateTask(value)
    else migrated[NODE_KEY_RENAMES.get(key) ?? key] = value
  }
  if (!('task' in migrated)) migrated.task = 'none'
  return migrated
}

function migrateV6ToV7(document) {
  if (!isRecord(document) || document.version !== SOURCE_VERSION) {
    throw new Error(
      `expected a v${SOURCE_VERSION} document (top-level "version": ${SOURCE_VERSION}), got version ${JSON.stringify(document?.version)}`,
    )
  }
  return {
    ...document,
    version: TARGET_VERSION,
    nodes: Array.isArray(document.nodes)
      ? document.nodes.map(migrateNode)
      : document.nodes,
  }
}

function main(argv) {
  const [raw] = argv
  if (raw === undefined) {
    process.stderr.write(
      'usage: node ctx/support/migrate-v6-to-v7.mjs \'<v6 document JSON>\'\n',
    )
    return 1
  }
  try {
    const migrated = migrateV6ToV7(JSON.parse(raw))
    process.stdout.write(`${JSON.stringify(migrated, null, 2)}\n`)
    return 0
  } catch (error) {
    process.stderr.write(`migrate-v6-to-v7: ${error.message}\n`)
    return 1
  }
}

process.exitCode = main(process.argv.slice(2))
