# Edits to a just-created entity failed before its server id was known

## Status of this document

Investigation findings plus the fix. The fix is implemented.

## Reported

In network mode against PostgREST: create a note, then edit it (move it or
type in it). An error toast appears. After a reload the edit is gone.

## Root cause

Network saves sent each gesture's ops with whatever ids the ops held **when
they were built**. Nothing waited for an earlier create's POST to come back
first. Two paths reached the same failure, a `PATCH` addressed to the
client-minted id, which the server has never seen:

1. **Saves ran in parallel.** `state/history/boardHistoryAtom.ts`'s debounced
   saver called `saveMutation.mutate(pending)` on every flush, and the
   `MutationObserver` had no `scope`, so TanStack Query started each mutation
   immediately. If the create's `POST /nodes` was still in flight when the
   edit's batch flushed (500ms debounce), the edit's PATCH went out alongside
   it.
2. **The saver's queued batch was never reconciled.** When the POST resolved,
   `reconcileNetworkEntityIdAtom` (`state/networkReconcile.ts`) rewrote the
   id in `currentBoardAtom`, history, selection and the route, but not in the
   `PendingSave` the debounced saver was holding. An edit made while the POST
   was in flight was already in that batch under the client id, and was sent
   that way.

`api/networkOps.ts` resolved ids only through a batch-scoped `IdRemapTable`.
`260925-network-id-reconciliation.md` assumed a later batch is always built
from already-reconciled state, and both paths above break that assumption.

PostgREST shows it more than json-server. A PATCH that matches no rows comes
back `[]`, which the dialect maps to `'not-found'` (a throw). Postgres also
enforces FK constraints on creates that reference a client id. json-server
accepts dangling references silently.

Two related failures had the same cause. Undoing a create before it resolved
PATCHed the client id. A create that failed outright was never reconciled,
so every later edit to that entity failed too. Each failed batch was dropped
(no retry), and the UI kept showing the optimistic value until a reload.

## The fix

Network saves are now an **ordered, retrying outbox**:

1. **Strictly serial.** `saveMutation` has `scope: { id: 'board-save' }`, so
   TanStack Query runs saves one at a time, in order. A batch is never sent
   before every earlier batch, including its creates, has finished.
2. **Ids resolved at send time.** `api/boardApi.ts` keeps one session-lived
   `confirmedIds` table (`api/networkIdRemap.ts`) and passes it to every
   `applyOpsToNetwork` call. Because saves are serial, every earlier create
   has recorded its server id there by the time a batch is sent, whatever id
   the batch's ops were built with. Canonical-state reconciliation
   (`networkReconcile.ts`) is unchanged. It still makes ops built *after* the
   create carry the server id directly.
3. **Failures retry forever, never drop.** Retries use capped exponential
   backoff (1s, 2s, 4s … 30s). Every later save waits behind the failing one,
   so a failed create holds back its dependents instead of letting them fail.
   This applies to plain edits too (decided 2026-10-29: reliability over
   speed).
4. **Retries are idempotent.** A failed batch is re-sent whole. A create
   already recorded in the table (`isConfirmed`) is skipped rather than
   POSTed again. `recordRemap` now records an id even when the server kept
   it unchanged, so that case also counts as confirmed. PATCHes are naturally
   repeatable. Local mode rewrites the whole document, so it is too.
5. **One toast per run of failures** ("Couldn't save your changes. Retrying
   automatically."), cleared on the next successful save.
6. `networkMode: 'always'`, so local-mode saves don't pause while the browser
   reports itself offline.

### Known limits (left for the follow-up visibility task)

- **The outbox is in memory.** Reloading or closing the tab while saves are
  queued or retrying loses them.
- **A permanently failing request blocks every later save.** Examples are a
  4xx from a schema mismatch, or a bad auth token (a save keeps the config it
  was queued with, so fixing the token doesn't rescue it). The only visible
  sign is the one toast.
- **TanStack Query pauses retries while the tab is unfocused,** and resumes
  them on focus.
- **A create whose POST succeeded but whose response was lost** (e.g. a
  connection drop) is retried and creates a duplicate row. There's no way to
  detect this without client-supplied ids.

## Regression coverage

- `src/api/networkOps.test.ts`: cross-batch resolution through a shared
  table (update target and edge FK), no re-POST of creates or image creates
  when a batch is retried after failing partway, an unchanged server id
  counts as confirmed, and the default table is still fresh per call.
- `src/api/networkIdRemap.test.ts`: `isConfirmed`, and equal ids recorded.
- `src/state/history/boardHistoryAtom.test.ts`: a later save waits for the
  earlier one; a failed save is retried with backoff and never dropped; later
  saves wait behind it; one toast per run of failures.
- `e2e/networkModeCrud.spec.ts`: "edits to a card whose create is still in
  flight". The node POST is held for 3s while the user types into the
  ⌘/Ctrl+N card. The content lands under the server id, with no toast and no
  duplicate node.
