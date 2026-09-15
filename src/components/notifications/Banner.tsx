// A single, non-blocking, dismissible banner shape shared by the two
// spec §9 notifications (corrupt-save recovery, import failure) — both
// want the same "generic message + dismiss" UI, not per-case bespoke
// chrome (spec explicitly says don't build structured/field-level error
// reporting for v0).

export function Banner({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  return (
    <div className="banner" role="status">
      <span className="banner__message">{message}</span>
      <button
        type="button"
        className="banner__dismiss"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  )
}
