// Non-blocking read-path failure notice (network mode design doc §7) — the
// view stays on its last-good state underneath, same pattern as
// RecoveryBanner, but with a real retry action (re-running exactly the
// load that failed) rather than just an acknowledge-and-dismiss.

import { useAtom } from 'jotai'
import { networkLoadErrorAtom } from '../../state/networkBoardLoader'
import { Banner } from './Banner'

export function NetworkErrorBanner() {
  const [error, setError] = useAtom(networkLoadErrorAtom)
  if (!error) return null

  return (
    <Banner
      message={`${error.message} (retrying keeps whatever's already loaded)`}
      onDismiss={() => setError(undefined)}
      action={{
        label: 'Retry',
        onClick: () => {
          setError(undefined)
          error.retry()
        },
      }}
    />
  )
}
