// Spec §9/Q12: if the persisted board couldn't be parsed/validated, the
// app falls back to the seed board (already done, silently, by
// state/persistence/storage.ts + boardHistoryAtom.ts) but must visibly
// tell the user that happened, and must not autosave over the original
// corrupt bytes until they've acknowledged it. This pushes that notice as
// a toast (once, on mount); dismissing it — manually or via the toast's
// own auto-dismiss — is the acknowledgement that resumes autosave.

import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef } from 'react'
import { pushToastAtom } from '../../state/atoms/toasts'
import {
  acknowledgeRecoveryAtom,
  boardLoadResultAtom,
} from '../../state/history/boardHistoryAtom'

export function RecoveryNotice() {
  const loadResult = useAtomValue(boardLoadResultAtom)
  const acknowledge = useSetAtom(acknowledgeRecoveryAtom)
  const pushToast = useSetAtom(pushToastAtom)
  const pushed = useRef(false)

  useEffect(() => {
    if (pushed.current || loadResult.ok) return
    pushed.current = true
    pushToast(
      "Your saved board couldn't be read, so a fresh starter board was loaded instead. Your previous data is still on this device and hasn't been overwritten yet.",
      acknowledge,
    )
  }, [loadResult, acknowledge, pushToast])

  return null
}
