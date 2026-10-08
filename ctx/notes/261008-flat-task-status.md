# Flat, required task status with explicit `'none'` (schema v7)

Supersedes the "`task` is nested (`{ status }`)" decision in
`260915-prototype-migration-phase2-schema.md` §2.

## Why

A node's task status was `task?: { status: TaskStatus }`: an optional
wrapper object around a single enum. That's awkward to map onto a
relational backend. It's really one enum column:

```sql
CREATE TYPE task_status AS ENUM ('none', 'todo', 'blocked', 'in_progress', 'done');
-- nodes.task task_status NOT NULL DEFAULT 'none'
```

An intermediate draft of v7 (never merged) made it a bare enum that was
nullable/optional, with `null` and absent both meaning "not a task". That
was dropped in favor of an explicit `'none'` value because:

- **One representation.** There's no null-vs-absent equivalence for the
  frontend, the API and the DB to agree on, and the column can be
  `NOT NULL`.
- **Every write carries a value.** Optional fields are removed from a node
  by deleting the key, which serializes to an *omitted* field in a
  network-mode PATCH body, so the server never clears it. That broke
  un-tasking and undoing "Default → Task" on a node with no `task` key.
  With a required field, an update op's `before`/`after` always hold a
  concrete value, so undo/redo PATCHes always reach the server.
- **The compiler finds every creation site.** A required field can't be
  silently left out by a card factory, `createContainer`, paste/duplicate,
  or the seed.

## The schema change

- `TaskStatusSchema` is unchanged: the four real statuses (`todo`,
  `blocked`, `in_progress`, `done`).
- `TaskFieldSchema` = `'none'` + those four. `NodeBaseSchema.task` is
  **required** `TaskFieldSchema`. `null`, absent, `{ status }`, or an
  unknown string all fail validation.
- `isTask(node)` (`schema/node.ts`) is the only "is this a task" check: a
  type guard narrowing `task` to `TaskStatus`. Status-only consumers (the
  `TaskStatusIcon` glyph, `resolveNodeAccent`'s task accent) take
  `TaskStatus`, so they can't be handed `'none'` without narrowing first.
  Never test `task` for truthiness: `'none'` is truthy.
- New nodes are created with `task: 'none'`; un-tasking writes `'none'`.
- `SCHEMA_VERSION` is 7.

## Local mode (localStorage / imports): migrated on read

`schema/legacy.ts` gives every pre-v7 node a required `task`:
`{ status: s }` becomes `s`; the prototype's flat `taskStatus` becomes its
value; absent, `null`, or a `{ status }`-less wrapper becomes `'none'`. A
v7+ document's nodes are never touched, so a missing or old-format `task`
there fails `NodeSchema`. This is the same rule as v6's `isRoot` migration
(`261006-root-board-isroot.md`).

## Network mode: validated strictly, never repaired

Network reads go through `NodeSchema` per entry (`api/validateEntries.ts`),
with no legacy normalization. A node whose `task` is a `{ status }` object,
`null`, or missing fails the load. The home board's nodes load inside
Settings' Save & Connect, so a bad node there fails the connection check
with the usual "server's data doesn't match this app's schema" message,
naming the request and node id. On any other board, that board's load
fails instead. Fixing server data is the server's job; a `DEFAULT 'none'`
column means real rows always carry it.

Known limitation: because `NodeSchema` is a `z.union`, Zod reports the
failure at the node (`Invalid input`), not at `task`. The message names the
node id but not the field. This applies to every node-level validation
failure, not just this one.

## Migrating data outside the app

`ctx/support/migrate-v6-to-v7.mjs` converts a v6 document to v7 (every
v7 change, this one included). It's kept in sync with
`schema/legacy.ts` by `src/schema/migrateV6ToV7Script.test.ts`.
