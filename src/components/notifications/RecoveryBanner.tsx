// Spec §9/Q12: if the persisted board couldn't be parsed/validated, the
// app falls back to the seed board (already done, silently, by
// state/persistence/storage.ts + boardHistoryAtom.ts) but must visibly
// tell the user that happened, and must not autosave over the original
// corrupt bytes until they've acknowledged it. This banner is that visible
// notice; dismissing it is the acknowledgement that resumes autosave.

import { useAtomValue, useSetAtom } from 'jotai'
import {
  acknowledgeRecoveryAtom,
  boardLoadResultAtom,
  recoveryAcknowledgedAtom,
} from '../../state/history/boardHistoryAtom'
import { Banner } from './Banner'

export function RecoveryBanner() {
  const loadResult = useAtomValue(boardLoadResultAtom)
  const acknowledged = useAtomValue(recoveryAcknowledgedAtom)
  const acknowledge = useSetAtom(acknowledgeRecoveryAtom)

  if (loadResult.ok || acknowledged) return null

  return (
    <Banner
      message="Your saved board couldn't be read, so a fresh starter board was loaded instead. Your previous data is still on this device and hasn't been overwritten yet."
      onDismiss={acknowledge}
    />
  )
}
