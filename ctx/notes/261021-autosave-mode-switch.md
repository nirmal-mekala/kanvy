# Autosave across a mode switch

## Problem

Autosave is debounced (500ms, `createDebouncedSaver`). The save mutation
in `state/history/boardHistoryAtom.ts` decided where to send a save —
Local (`saveBoard`, whole document to localStorage) or Network
(`saveBoardOverNetwork`, per-op REST calls) — by reading `accessModeAtom`
*when the debounce flushed*, not when the edit was made. Nothing flushed
or cancelled the pending save on a mode switch, so an edit made within
500ms of switching went to the wrong place:

- **Local → Network**: a fresh Local document's board card measures its
  height on first render (`setNodeHeightAtom`, `{"h":120}`). Connecting
  inside the debounce window sent that op to the backend as
  `PATCH /nodes/<local id>` → 404, plus the "An error occurred during
  save" toast. Any other just-made Local edit (e.g. a create) would have
  been POSTed to the server.
- **Network → Local** (data loss): `switchToLocalMode` swaps in the Local
  document and resets history, so Local's next save (often that same
  height measurement) merged with the still-pending Network ops.
  `mergePendingSave` keeps only the newest `board`, and Local saves only
  write `board` — the Network edit was silently dropped. Had no Local
  edit followed, the pending save would instead have written the
  *Network* document into localStorage.

## Fix

- Every `PendingSave` carries a `target` (`{ mode: 'local' }` or
  `{ mode: 'network', config }`), stamped by `queueSave` when the edit is
  queued. The mutation routes by `pending.target`, never by current
  state.
- `queueSave` flushes the saver before queueing a save whose target
  differs from the one already pending (mode, base URL, token or
  dialect), so two targets never merge.
- A default-store subscription on `accessModeAtom`/`networkConfigAtom`
  flushes the saver on any mode/connection change. One subscription
  covers every switch site (mode toggle, settings modal, boot reconnect,
  `boardAccessResolver`'s cross-mode navigation) without each having to
  remember to flush.

## Coverage

- `src/state/history/boardHistoryAtom.test.ts` — both directions, the
  merge guard on its own, and a base-URL change mid-debounce.
- `e2e/networkModeCrud.spec.ts`'s "autosave across a mode switch" block —
  both directions against a real json-server.
