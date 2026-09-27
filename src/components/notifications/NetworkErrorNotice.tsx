// Non-blocking read-path failure notice (network mode design doc §7) — the
// view stays on its last-good state underneath. Surfaced as a toast rather
// than a banner (no retry action — the user re-triggers a load by
// navigating or changing network settings).

import { useAtom, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { pushToastAtom } from '../../state/atoms/toasts'
import { networkLoadErrorAtom } from '../../state/networkBoardLoader'

export function NetworkErrorNotice() {
  const [error, setError] = useAtom(networkLoadErrorAtom)
  const pushToast = useSetAtom(pushToastAtom)

  useEffect(() => {
    if (!error) return
    pushToast(error.message)
    setError(undefined)
  }, [error, pushToast, setError])

  return null
}
