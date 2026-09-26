// A single, non-blocking, dismissible banner shape shared by the two
// spec §9 notifications (corrupt-save recovery, import failure) — both
// want the same "generic message + dismiss" UI, not per-case bespoke
// chrome (spec explicitly says don't build structured/field-level error
// reporting for v0).

export function Banner({
  message,
  onDismiss,
  action,
}: {
  message: string
  onDismiss: () => void
  /** An optional retry-style action button (network mode design doc §7) — rendered before the dismiss button. */
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="banner" role="status">
      <span className="banner__message">{message}</span>
      {action && (
        <button
          type="button"
          className="banner__action"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
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
