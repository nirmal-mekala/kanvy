// Boots the app: theme wiring (global, mounted once regardless of route),
// then hands off to the TanStack Router tree (router.tsx) — whose root
// layout owns the toolbar (Stage 7), the corrupt-save recovery banner
// (Stage 9, spec §9/Q12), and per-board routing (multiboard support,
// ctx/notes/260917-multiboard-support-design.md §6). Board load already
// fell back to the seed board on corrupt data (see
// state/persistence/storage.ts); dismissing the banner is the
// acknowledgement that resumes autosave (`recoveryAcknowledgedAtom`).
//
// `QueryClientProvider` wraps the router tree using the single shared
// `queryClient` (api/queryClient.ts) — the same instance
// state/history/boardHistoryAtom.ts's outside-of-React mutation dispatch
// uses, so both see one cache/mutation-observer world (ctx/notes/260921-
// action-based-undo-and-tombstoning.md §3).
//
// `ReactQueryDevtools` is dev-only and lazy-`import()`ed only when
// `import.meta.env.DEV` — `@tanstack/react-query-devtools` is a
// devDependency, so a static top-level import would ship it (and pull it
// into a `pnpm install --prod`) regardless of whether it ever renders;
// this is the pattern TanStack's own docs recommend for exactly that
// reason, and lets Vite's build-time dead-code elimination on the
// statically-known `import.meta.env.DEV` check drop the whole `import()`
// from a production bundle. Its default floating toggle button would
// otherwise collide with this app's own bottom bar (`.board__bottom-bar`,
// index.css — help/mode-toggle/zoom controls) — so it's nudged up above
// `.board__zoom` via a `.tsqd-open-btn-container` override in index.css
// rather than left at its default 12px-from-corner position.

import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useAtomValue, useSetAtom } from 'jotai'
import { lazy, Suspense, useEffect } from 'react'
import { queryClient } from './api/queryClient'
import { testConnection } from './api/restClient'
import { router } from './router'
import {
  accessModeAtom,
  networkConfigAtom,
} from './state/atoms/networkSettings'
import { themeAtom } from './state/atoms/theme'
import { pushToastAtom } from './state/atoms/toasts'
import { initializeNetworkMode } from './state/networkBoardLoader'

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((mod) => ({
        default: mod.ReactQueryDevtools,
      })),
    )
  : null

function App() {
  const theme = useAtomValue(themeAtom)
  const networkConfig = useAtomValue(networkConfigAtom)
  const setAccessMode = useSetAtom(accessModeAtom)
  const pushToast = useSetAtom(pushToastAtom)

  // Matches the prototype's useTheme.js: the theme lives on <html>'s
  // data-theme attribute, so index.css's `[data-theme='dark']` override
  // cascades to every component regardless of DOM depth.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Boot-time auto-connect: if a base URL was persisted from a prior
  // session, try it once on mount. Success switches into Network mode;
  // failure just toasts and leaves the app in its default Local mode,
  // without touching what's persisted (so the next reload retries the
  // same way — see networkSettings.ts). Runs after mount, so it never
  // delays local mode's own synchronous initial board load
  // (state/history/boardHistoryAtom.ts).
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally a one-shot effect run once on mount, not on every config/atom change
  useEffect(() => {
    if (!networkConfig.baseUrl) return
    let cancelled = false
    void (async () => {
      try {
        await testConnection(networkConfig)
        if (cancelled) return
        setAccessMode('network')
        await initializeNetworkMode(networkConfig)
      } catch {
        if (cancelled) return
        pushToast(
          'Could not connect to the network backend — check your connection settings.',
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {ReactQueryDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools
            initialIsOpen={false}
            buttonPosition="bottom-right"
          />
        </Suspense>
      )}
    </QueryClientProvider>
  )
}

export default App
