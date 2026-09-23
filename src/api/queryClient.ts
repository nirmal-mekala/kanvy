// A single shared QueryClient (ctx/notes/260921-action-based-undo-and-
// tombstoning.md §3) — one instance so `App.tsx`'s `<QueryClientProvider>`
// and `state/history/boardHistoryAtom.ts`'s outside-of-React mutation
// dispatch (the atom layer isn't itself a React component — same reason
// `router.tsx`'s `beforeLoad` reads jotai's default store directly rather
// than via a hook) share one cache/mutation-observer world instead of two
// disconnected ones.

import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient()
