# Node `index` renamed `position` (schema v7)

Part of the v6 → v7 pass alongside the flat task status
(`261008-flat-task-status.md`).

## Why

`INDEX` is a SQL keyword: reserved in MySQL and SQLite, so a column named
`index` has to be quoted there; non-reserved in Postgres, where it works
unquoted but still reads ambiguously next to `CREATE INDEX`. The field is
the node's explicit per-board ordering key, so `position` says what it is
and needs no quoting anywhere:

```sql
-- nodes.position DOUBLE PRECISION NOT NULL
```

## The change

- `NodeBaseSchema.index` → `position`. Same meaning, same type: a required
  float, fractional-indexing style. See `src/schema/node.ts` and
  `260921-action-based-undo-and-tombstoning.md` Q4 for why it's a float
  (`DOUBLE PRECISION`/`REAL`, never `INTEGER`/`SERIAL`).
- `state/liveEntities.ts`'s `nextNodeIndex` → `nextNodePosition`. Every
  writer (`addNodeAtom`, `addNodesAtom`, board-node creation, card/container
  factories, the seed) writes `position`.
- Array order is still the live render/paint source of truth; `position` is
  still written at creation and read by nothing at render time. Same as
  `index` was.

## Local mode (localStorage / imports): migrated on read

`schema/legacy.ts`'s pre-v7 step (`migrateToV7Node`, shared with the task
change) renames a node's `index` to `position`, keeping its value. A node
with neither (pre-v4) is still backfilled densely per board from array
order. A v7+ node's leftover `index` is never renamed; Zod strips it as an
unknown key, and a missing `position` is backfilled the same way.

## Network mode: validated strictly, never repaired

A server node with `index` and no `position` fails `NodeSchema`
(`position` is required), failing the load or connection check like any
other v7 mismatch.

## Migrating data outside the app

`ctx/support/migrate-v6-to-v7.mjs` converts a v6 document to v7 (every
v7 change, this one included). It's kept in sync with `schema/legacy.ts` by
`src/schema/migrateV6ToV7Script.test.ts`.
