# Safe network deletes (schema-agnostic FK safety)

Follows `261020-network-dialects.md` and
`261009-network-reaper-and-image-lifecycle.md`. Goal: no hard delete the
app sends can remove more than intended, whatever `ON DELETE` rule the
Postgres schema uses.

## What we know about the schema

- `nodes.board_id → boards ON DELETE CASCADE`
- `nodes.image_id → images ON DELETE RESTRICT`
- Other foreign keys exist (`edges.board_id`, `edges.from_node_id`,
  `edges.to_node_id`, `nodes.board_ref`), but their `ON DELETE` rules
  aren't in the OpenAPI spec. The design below doesn't depend on them.

## Where the app deletes

1. **The network reaper** (`api/networkReaper.ts`) is the only real
   source of deletes.
2. **`networkOps.applyImageOp`** had a `DELETE /images/:id` branch for an
   image op with no `after`. No mutation produces such an op, so the
   branch was unreachable. It now sends nothing. Images are deleted only by
   the reaper, after it has asked the server whether anything still
   references them. An op only knows the client's partially loaded
   document, and images are shared across nodes and boards.

## The risks, and what now prevents each

The reaper plans its deletes from one round of reads, then deletes one row
per request, sequentially. Before this change, nothing stopped a row that
changed after planning from being deleted.

| Risk | Example | Guard |
|---|---|---|
| A row restored after planning gets deleted | another tab undoes a delete mid-run | each delete is **guarded** by the reason it's in the plan |
| A board's content is deleted although the board was restored | board un-trashed before its content is reached | per board, a fresh read confirms it's **still an aged, trashed, non-root board** right before its content is deleted |
| `CASCADE` deletes rows the plan never saw | a node added to a reaped board after planning | before a board delete, a fresh read confirms **no node (`boardId`/`boardRef`) or edge (`boardId`) still references it**; otherwise it's skipped |
| An edge FK cascades into, or rejects, a node delete | an edge to the node created after planning | before node deletes, a fresh batched read of edges touching them; any node still touched is skipped |
| An image still in use is deleted | a shared image | an existing server-side reference check, plus `RESTRICT` on Postgres |

**Guards by reason** (`DeleteReason` in `state/networkReapPlan.ts`):
- `tombstone`: `status = trashed AND updatedAt < cutoff`. The cutoff is
  the same strict boundary as `state/reaper.ts`.
- `on-board`: `boardId = <reaped board>`. The board itself was just
  re-confirmed.
- `touching` (edges only): `fromNodeId`/`toNodeId` unchanged.
- boards: the `tombstone` guard with the board cutoff.

A tombstone reason takes precedence over an on-board reason, so a
trashed, aged node on a board that gets restored is still reaped.

**Atomicity.** `Dialect.atomicDeleteGuards`:
- **PostgREST (`true`)**: guards are ordinary filters on the DELETE, so
  Postgres checks them in the same statement. A row that no longer
  matches comes back as an empty result, which is read as not-found and
  skipped.
- **json-server (`false`)**: path DELETEs can't take conditions.
  `restClient.deleteEntity` reads the row first and checks the guards
  itself (`rowMeetsGuard`). This is best effort, with a small window
  between the read and the delete. json-server has no foreign keys, so
  nothing can cascade there.

**Order.** Standalone tombstones go first (edges, then nodes). Then, for
each confirmed board, its edges and then its nodes. Then boards, then
images. Any failed or refused delete is warned about and skips everything
that depends on it; the next network start retries.

## Residual risk (accepted)

- **Re-check-then-delete windows.** The board-referencers check and the
  node-touching-edges check are separate reads before the delete. A row
  created in that window (milliseconds) would be cascaded (board → its
  nodes) or would make the delete fail (`RESTRICT`). The board's own
  status guard *is* atomic on PostgREST. Closing the window would take
  server-side support, such as an RPC function doing the whole check and
  delete in one transaction.
- **Board restored mid-content-delete.** Content deletes for one board
  run after that board's re-confirmation. If the board is restored while
  its content is being deleted, the content already deleted is gone.
  There's no restore UI, and the tombstone is 24h old, so this needs a
  long-lived undo stack in another tab.
- **Extra requests.** Per board there are 1 confirmation read and 3
  referencer reads, plus 2 reads per 50 nodes. The reaper runs in the
  background and only when there's something to reap.
- **json-server ISO timestamps.** json-server compares the
  `updatedAt:lt` filter as strings. That's correct as long as every
  `updatedAt` is `toISOString()`-formatted, which is the only format the
  app writes.

## Tests

- `networkReapPlan.test.ts`: reasons, and tombstone precedence.
- `networkReaper.test.ts`: four mid-run change scenarios.
  - board restored
  - node added to a reaped board
  - tombstone restored
  - edge created
- `restClient.test.ts`: atomic PostgREST guards versus json-server's
  read-then-delete.
- e2e reaper test (`networkModeCrud.spec.ts`) runs against a real
  json-server.
