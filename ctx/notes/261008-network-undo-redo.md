# Network-mode undo/redo

Found while flattening link fields (`261008-flat-link-fields.md`). The bug
predates schema v7. No schema change.

## The bug

Network-mode saves never knew whether a batch of ops was being done,
undone or redone. `boardHistoryAtom.ts` called
`saveBoardOverNetwork(config, pending.ops)` without the direction, and
`api/networkOps.ts` always PATCHed `op.after` and always POSTed a
`create`. So, in network mode:

- **undo of an update** re-sent the *forward* value; the server kept the
  undone state;
- **undo of a create** POSTed the entity a second time;
- local state was correct, so the app and server silently diverged until
  the next reload.

localStorage mode was unaffected: it persists the whole document.

## The fix

`PendingSave` carries `replay: OpReplay` (`'do' | 'undo' | 'redo'`,
`state/ops.ts`) instead of `direction`, threaded through
`saveBoardOverNetwork` to `applyOpsToNetwork(config, ops, replay)`:

| op               | do                                        | undo                                              | redo                                                      |
| ---------------- | ----------------------------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| `update`         | PATCH `after`                             | PATCH `before`                                    | PATCH `after`                                             |
| `create`         | POST (reconcile id)                       | PATCH `{ status: 'trashed', updatedAt: <now> }` | PATCH `{ status: 'active', updatedAt: <op.value.updatedAt> }` |
| `image` (create) | POST (reconcile id)                       | nothing                                           | nothing                                                   |
| `image` (other)  | PATCH / DELETE by `before`→`after`        | the same, `after`→`before`                        | the same as do                                            |

(The `image` create rows and the `updatedAt` in the `create` rows were
added on 261009; see `261009-network-reaper-and-image-lifecycle.md`.)

- **Undoing a create is a tombstone, not a DELETE.** The entity stays on
  the server (trashed), so redo reactivates the same record with a status
  PATCH: no second POST, and no new server id to reconcile. Nodes, edges
  and boards all have `status`. Locally, undoing a create still removes it
  from the array (`applyOps(…, 'before')`), so the server copy is trashed
  but the local one is gone, which renders the same.
- **An image create's undo and redo send nothing** (since 261009). The
  image row stays on the server through undo, because the now-trashed node
  still references it, and a backend with a `RESTRICT` foreign key would
  reject the DELETE. Redo has nothing to re-create, and the row's server
  id was already reconciled into app state and history by the original
  POST. The network reaper deletes the row once its last referencing node
  is reaped (`261009-network-reaper-and-image-lifecycle.md`). Locally the
  entry is still dropped on undo and re-added on redo. (Before 261009,
  undo DELETEd the image and redo re-POSTed it.)
- **Undo/redo of a create carry `updatedAt`** (since 261009). Undo stamps
  the tombstone time, because the network reaper ages a trashed entity by
  `updatedAt`. Redo restores the original, matching local redo, which
  re-appends `op.value` unchanged.
- **Undo replays a batch in reverse order**, matching the local
  `applyOps(…, 'before')`.
- Removed fields go over the wire as explicit `null` in both directions
  (`patchBody`, from `261008-flat-link-fields.md`). E.g. undoing a text →
  link conversion sends `linkUrl: null`.
- `ReplaceBoardOp` is still skipped (no REST mapping).

Coverage: `src/api/networkOps.test.ts` (replay mapping per op kind,
reverse order) and `e2e/networkModeCrud.spec.ts`'s undo/redo test against
a real json-server (create → recolor → undo ×2 → redo ×2, asserting server
state at each step and that only one server node ever exists). The e2e
fails with the replay mode stubbed back to `'do'`.

## Known limitation (not addressed)

An undo fired while its create's POST is still in flight can race it.
Saves aren't serialized (no TanStack Query mutation `scope`), and an op
captured before its entity's id was reconciled still holds the local id.
So undo-immediately-after-create may PATCH a local id the server doesn't
know (404, surfaced as a save-failure toast). The same window already
existed for any forward edit made while a create's POST was in flight.
Candidate fix: a mutation `scope` to serialize saves, plus resolving op
ids through the reconciliation aliases at send time (today
`resolveReconciledNodeId` covers nodes only).
