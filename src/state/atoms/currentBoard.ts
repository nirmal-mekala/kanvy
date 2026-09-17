// Which board is currently being viewed/edited — read by every node/edge
// query and mutation atom to scope itself to one board's content, and by
// undo/redo to gate which history entries they're allowed to act on (see
// state/history/boardHistoryAtom.ts). A standalone module (no dependency on
// boardHistoryAtom.ts or state/atoms/boards.ts) so both of those can depend
// on it without a circular import.
//
// Defaults to the root board — there's no navigation UI yet (that's
// multiboard-support implementation plan Sub-phase 3), so this is
// effectively a constant for now; TanStack Router's route loader will drive
// it from there on.

import { atom } from 'jotai'
import { ROOT_BOARD_ID } from '../../schema/boardMeta'

export const currentBoardIdAtom = atom<string>(ROOT_BOARD_ID)
