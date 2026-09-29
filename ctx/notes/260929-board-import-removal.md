# Removal of the board import feature

The board-import feature (spec §9/Q14: an "Upload" toolbar button that
opens a JSON file picker, parses+validates it via
`parseImportedBoard`/`normalizeLegacyBoard`/`BoardSchema`, and swaps the
whole board via `loadImportedBoardAtom`) has been removed at the
developer's request. Export (the "Download" toolbar button, `exportBoard`)
is untouched — it's a distinct feature and stays.

## What was removed

- `src/state/persistence/import.ts`'s `parseImportedBoard`/`ImportResult`
  — the file was renamed to `export.ts` since only `exportBoard` remains
  in it (test file renamed `import.test.ts` → `export.test.ts` to match,
  keeping only its export-side coverage).
- `src/state/history/boardHistoryAtom.ts`'s `loadImportedBoardAtom`.
- `src/components/toolbar/Toolbar.tsx`'s hidden file `<input>`, the
  Upload icon button (and its `accessMode !== 'network'` gating), and
  `handleImportClick`/`handleImportFileChange`.
- The e2e `import-failure UI (spec §9/Q14)` spec in
  `e2e/errorHandlingA11yTouch.spec.ts`.
- `AGENTS.md`'s "and JSON import" validation-touchpoint mention.

## What was kept

- `ops.ts`'s `ReplaceBoardOp`/`'replace-board'` op kind — it wasn't
  import-exclusive: `boardHistoryAtom.ts`'s `acknowledgeRecoveryAtom`
  (corrupt-data recovery, spec §9/Q12) also produces one, as a
  force-overwrite with `before === after` since there's no prior *valid*
  board to diff against. Its doc comment was updated to point at
  `acknowledgeRecoveryAtom` instead of the now-removed import atom.
- `src/schema/legacy.ts` (`normalizeLegacyBoard`) — still used by
  `storage.ts`'s localStorage load path (a legacy/pre-version document can
  still land there), independent of file import.
- `exportBoard`/`serializeBoard` and the Download toolbar button.
- The two unit tests that used `loadImportedBoardAtom` purely as a
  convenient way to seed multi-board state for unrelated tests
  (`src/state/atoms/boards.test.ts`, `src/state/atoms/nodes.test.ts`) —
  they now seed via `currentBoardAtom` directly instead.

Historical process notes describing the feature as it existed
(`260915-kanvy-spec.md` §9/Q14, `260917-multiboard-implementation-plan.md`
§Q1, `260921-action-based-undo-and-tombstoning.md` §Q5,
`260923-network-mode-backend-integration-design.md`,
`260915-phase6-e2e-test-scenario-checklist.md`) were left as-is — they're
a record of what was decided/built at the time, not living documentation.
