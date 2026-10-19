# Container task inheritance

## Behavior

A node that lands in a task container takes on that container's task
status: a non-task (`task: 'none'`) becomes a task with the parent's
status; an existing task has its status overwritten. Only `task` is
inherited — no color, pattern, or anything else.

Decisions (confirmed with the user, 2026-10-19):

1. **Only on a change of parent.** Inheritance fires when a dropped
   node's immediate parent *after* the drop differs from its immediate
   parent at drag start. Nudging a node around inside the container it was
   already in does nothing, so a `done` card inside a `todo` container
   stays `done` when repositioned.
2. **"Inside" = completely within**, the same full-containment test as
   drag-carry (`fullyEncloses`). The **immediate parent** is the smallest
   such container (`immediateEnclosingContainer`, `containers/
   containment.ts`, shared with render order).
3. **Immediate parent only.** A non-task parent means nothing happens —
   no walking up to a task grandparent, and never un-tasking.
4. **Per item.** Each node the drag moved on its own account (the grabbed
   node and the rest of the selection) is judged against its own new
   parent, so one multi-selection drop can inherit different statuses.
5. **A dragged container's carried contents inherit with it**, at any
   depth (including through a non-task inner container). A carried node's
   own parent never changes — it moved with its carrier — so it simply
   follows its carrier's result rather than being judged itself.
6. **One undo step.** The drop's task updates join the drag's own history
   entry (`updateBoardAtom`'s `joinPresent` → reducer `coalesceMode:
   'always'`) regardless of how long the user paused before releasing, so
   one ⌘/Ctrl+Z restores both position and prior statuses.
7. **Creation at a point inherits too**: double-click (text card; a
   `board` card on root) and image-file drop. The new card's own rect
   (not the click point) must be completely within the parent. ⌘/Ctrl+N,
   paste, duplicate, container resize, and ⌘/Ctrl-drag container creation
   never inherit.

## Implementation

- `containers/inheritTask.ts` — pure: `computeDropTaskInheritance`
  (before/after node lists + dropped nodes with their carried ids →
  status per node that actually changes) and `inheritEnclosingTask`
  (creation-time stamp).
- `state/atoms/nodes.ts` — `inheritDropTasksAtom`, called from
  `useBoardInteraction.ts`'s `handleNodePointerUp` with the drag-start
  node snapshot and the dropped set captured in `beginNodeDrag`.
- `useCardCreation.ts` (double-click, image drop) and `state/atoms/
  boards.ts`'s `createBoardAtom` apply `inheritEnclosingTask` before
  creating.

## Notes / known edges

- Membership stays purely spatial (spec §2.3): this is a one-shot stamp at
  drop/creation time, not a stored relationship.
- A drag ended by `pointercancel` rather than `pointerup` does not
  inherit (the cancel path only clears drag state, as before).
- Network mode: undo/redo send the merged entry as one save. On the
  forward path, the inheritance PATCH merges into the drag's pending save
  only if it's still inside the saver's debounce window; after a long
  pause before release it goes out as its own PATCH.
- Only non-grabbed *selected* containers move without their contents
  (existing §4.4 behavior), so they inherit alone.
