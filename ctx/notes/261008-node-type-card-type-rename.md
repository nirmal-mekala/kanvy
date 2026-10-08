# Node `type`/`kind` renamed `nodeType`/`cardType` (schema v7)

Part of the v6 → v7 pass alongside `261008-flat-task-status.md` and
`261008-position-rename.md`.

## Why

- **`kind` was vague.** It only exists on cards, but read as a synonym for
  `type`, with nothing saying which was which. `cardType` says it's the
  card's sub-type.
- **`type` is a SQL keyword.** `TYPE` is non-reserved in Postgres, so it
  works unquoted, but it collides visually with `CREATE TYPE` (and v7's own
  `task_status` enum is created with exactly that). `nodeType` pairs with
  `cardType` and leaves no ambiguity.

## Casing: camelCase, not snake_case

`node_type`/`card_type` was proposed and rejected: every other field in the
document is camelCase (`boardId`, `fromNodeId`, `isRoot`, `imageId`,
`boardRef`, `createdAt`, …), and two snake_case fields would leave the JSON
inconsistent. The intended split is camelCase in JSON/TypeScript and
snake_case in Postgres, mapped at the API/ORM boundary:

```sql
-- nodes.node_type  node_type  NOT NULL   -- CREATE TYPE node_type AS ENUM ('card', 'container')
-- nodes.card_type  card_type  NULL       -- CREATE TYPE card_type AS ENUM ('text', 'image', 'link', 'board'); NULL for containers
```

Switching the whole document to snake_case was considered and deferred:
it's a schema-wide decision, not something to start with two fields.

## The change

- `type: 'card' | 'container'` → `nodeType`, with the same values.
- `kind: 'text' | 'image' | 'link' | 'board'` → `cardType`, on cards only
  and with the same values. Containers have no `cardType`.
- `CardNodeSchema` discriminates on `cardType`. `NodeSchema` is still a
  plain `z.union` (Zod v4 can't flatten a nested discriminated union), so
  validation failures still report at the node, not the field.
- Unaffected: unrelated uses of the words, such as undo ops' `kind`
  (`'create' | 'update' | 'image' | 'replace-board'`), id-remap kinds,
  resize-handle kinds, and DOM event/`DataTransferItem` types.

## Local mode (localStorage / imports): migrated on read

`schema/legacy.ts`'s pre-v7 step (`migrateToV7Node`) renames `type` to
`nodeType` and `kind` to `cardType`, along with the task and position
changes. Pre-v0 prototype documents are built directly in the v7 shape. A
v7+ node's leftover `type`/`kind` is never renamed; Zod strips them as
unknown keys, and the missing `nodeType` fails validation.

## Network mode: validated strictly, never repaired

A server node with `type`/`kind` and no `nodeType`/`cardType` fails
`NodeSchema`, failing the load or connection check.

## Migrating data outside the app

`ctx/support/migrate-v6-to-v7.mjs` renames both keys in place, keeping key
order. Its `NODE_KEY_RENAMES` table is where any further v7 rename goes.
`src/schema/migrateV6ToV7Script.test.ts` keeps it in sync with
`schema/legacy.ts`.
