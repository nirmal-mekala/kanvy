// Shared loading message for both waits the app can show: the boot-time
// network reconnect (App.tsx, rendered before the router — and so before
// the `.app` flex column — exists) and a per-board navigation wait
// (router.tsx's `boardRoute.pendingComponent`, rendered inside the root
// layout's Outlet, below the toolbar). `screen` is the former: with no
// flex parent to grow into, it fills the viewport itself so the message
// is still centered rather than pinned to the top of the page.
//
// The trailing dots step "" → "." → ".." → "..." in CSS (loading.css).
// All three are always laid out and only revealed by clipping, so the
// centered label never shifts as they appear. They're `aria-hidden`:
// `role="status"` announces the label alone, once, not every step.

type LoadingIndicatorProps = {
  label: string
  screen?: boolean
}

export function LoadingIndicator({
  label,
  screen = false,
}: LoadingIndicatorProps) {
  return (
    <div
      className={screen ? 'loading loading--screen' : 'loading'}
      role="status"
    >
      {label}
      <span className="loading__dots" aria-hidden="true">
        ...
      </span>
    </div>
  )
}
