# Flat link fields, in-memory fetch status (schema v7)

Part of the v6 → v7 pass alongside `261008-flat-task-status.md`,
`261008-position-rename.md` and `261008-node-type-card-type-rename.md`.
Supersedes the "`link` is nested" decision in
`260915-prototype-migration-phase2-schema.md` §2.

## Why

A link card's metadata was a nested object,
`link: { url, title?, imageUrl?, status }`. It's awkward as a relational
shape, for the same reason `task: { status }` was, and one of its fields
wasn't data at all:

- **`status` (`'loading' | 'ready' | 'error'`) is fetch state, not
  content.** It was persisted everywhere (localStorage, network POST/PATCH,
  `server/db.json`), but its only reader rendered "Loading…" vs. the title;
  `'ready'` and `'error'` rendered identically, and nothing retried. Since
  nothing re-fetches on load, a card persisted mid-fetch (reload, closed
  tab, failed PATCH) showed "Loading…" forever.
- Optional `title?`/`imageUrl?` meant "no value" was an absent key, which
  can't be blanked over a PATCH (see below).

## The schema change

On link cards (`cardType: 'link'`) only:

| v6                       | v7                                 |
| ------------------------ | ---------------------------------- |
| `link.url`               | `linkUrl: string`                  |
| `link.title?`            | `linkTitle: string \| null`        |
| `link.imageUrl?`         | `linkImageUrl: string \| null`     |
| `link.status`            | *(not persisted; in-memory only)*  |

`linkTitle`/`linkImageUrl` are required-but-nullable: `null` until a
metadata fetch fills them, or when the page has none. A stray `linkStatus`
on read is stripped as an unknown key.

```sql
-- nodes.link_url        TEXT NULL   -- non-null for link cards
-- nodes.link_title      TEXT NULL
-- nodes.link_image_url  TEXT NULL
-- (no link_status column)
```

## In-memory fetch status

`state/atoms/linkFetch.ts`:

- `pendingLinkFetchIdsAtom` holds the ids of link cards whose metadata
  fetch is in flight.
- `fetchLinkMetadataAtom` marks a card pending, fetches, applies
  `linkTitle`/`linkImageUrl` via `updateLinkAtom` on success, and clears
  pending either way. A failed fetch leaves the fields `null`, so the card
  shows its URL.
- `isLinkFetchPending` follows network id reconciliation, so a fetch
  started under a local id still shows "Loading…" once the server id lands.

It replaces `cards/applyLinkMetadata.ts`. A reload simply drops pending
state: the card shows its URL, never a stuck "Loading…". The design-review
fixture (`server/generate-db.ts`) no longer has loading/error rows; paste a
URL to see "Loading…" live.

## Blanking a field: explicit `null`

A field an update *removes* (e.g. a kind conversion dropping a text card's
`size`) is recorded in the op as `after[key] === undefined`. Locally that
deletes the key (`applyPatch`, `state/ops.ts`). Over the network,
`JSON.stringify` would drop it and leave the server's old value, so
`api/networkOps.ts`'s `patchBody` sends every removed field as an explicit
`null`.

Supporting changes:

- `replaceNodeAtom` (kind conversion) now records a field diff
  (`nodeUpdateOp`, shared with `patchSelectedNodes`) instead of the whole
  old and new node. A shallow merge of the whole new node never removed the
  old kind's fields, locally or on the server.
- `mergeOp` folds a coalesced update into a pending create with
  `applyPatch`'s rules, so a removed field is dropped rather than kept as an
  `undefined` key.

json-server stores the `null`; on read, the card's own schema strips keys
that don't belong to its kind (e.g. `size: null` on a link card). In
Postgres it's simply `NULL`.

## Local mode (localStorage / imports): migrated on read

`schema/legacy.ts`'s pre-v7 step flattens a nested `link`
(`flattenLegacyLink`). A missing title/image becomes `null` and `status` is
dropped. Prototype documents, already flat (`linkUrl`/`linkTitle`/
`linkImageUrl`/`linkStatus`), stay flat minus `linkStatus`. A v7+ node's
leftover nested `link` is never flattened; the card fails `NodeSchema`
(missing `linkUrl`).

## Network mode: validated strictly, never repaired

A server link card with a nested `link` and no flat fields fails
`NodeSchema`, failing the load or connection check.

## Migrating data outside the app

`ctx/support/migrate-v6-to-v7.mjs` flattens `link` in place (same key
position), null-filling and dropping `status`.
`src/schema/migrateV6ToV7Script.test.ts` keeps it in sync with
`schema/legacy.ts`.

## Network undo/redo (fixed separately)

While doing this, network-mode undo/redo was found not to reach the server
(saves ignored the undo direction). Fixed in
`261008-network-undo-redo.md`. The explicit-`null` mapping above applies
to undo's `before` patches as well.
