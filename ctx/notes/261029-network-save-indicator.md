# Network save indicator

## Status of this document

Design plus implementation notes. Implemented; e2e specs written but not yet
run (host Playwright server version mismatch at time of writing).

## What it is

A row of small dots just above the Local/Network mode toggle, one per
network save batch in the ordered outbox
(`261029-edits-to-unconfirmed-creates.md`). No dots, or only green ones,
means everything has landed.

| Dot | Meaning | Color token |
|---|---|---|
| queued | waiting behind an earlier save, or still in the 500ms debounce window | `--color-ink-soft` |
| in flight | being sent now (pulses; static under reduced motion) | `--color-task-in-progress` |
| retrying | has failed at least once, backing off / re-sending | `--color-task-blocked` |
| resolved | landed; disappears after 2s | `--color-task-done` |

Colors reuse the task palette so the meanings line up. Hovering shows a
count per state (`title`).

## Where the state comes from

- **Mutation cache, not a parallel copy.** `SaveIndicator.tsx` reads
  `useMutationState` filtered by `networkSaveFilters`
  (`state/history/boardHistoryAtom.ts`): `mutationKey ['board','save']`
  whose `variables.target.mode` is `'network'`. TanStack Query reports a
  scope-blocked mutation as `pending` + `isPaused`, the running one as
  `pending` and not paused, and a failed one as `failureCount > 0`.
- **The debounced batch** isn't in the cache yet, so the saver flips
  `heldNetworkSaveAtom` when it queues a network save and clears it on
  flush.
- **Linger.** The cache has no completion timestamp, so the component
  records when it first sees each success (`noteResolved`) and re-renders
  when the earliest visible one expires. Successes already in the cache at
  mount are marked expired, so remounting never flashes old saves green.
- The pure model is `state/saveIndicator.ts` (unit-tested).

## Decisions

- **One dot per batch (gesture), not per HTTP request.** A batch is the
  unit the outbox orders and retries.
- **Network saves only.** Local saves are instant whole-document writes.
  A save stamped for the network keeps showing after switching to Local.
- **A fourth "retrying" state** was added beyond queued / in flight /
  resolved, since a permanently failing save blocks everything behind it
  and was previously visible only as one toast.
- **Cap of 14 dots.** Oldest resolved dots are dropped first; unresolved
  saves past the cap show as `+N`.
