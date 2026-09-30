// Shared inline message UI for settings-modal fields (SettingsModal.tsx):
// the persist-token warning, the json-server tip, and the connection
// error are all "a short note about a field, tagged by severity" — one
// component with a `tone` keeps their icon/color/layout in sync instead
// of three near-duplicate <p> blocks drifting apart over time.

import { CircleAlert, Lightbulb, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

const TONE_ICON = {
  tip: Lightbulb,
  warning: TriangleAlert,
  error: CircleAlert,
} as const

export function FieldMessage({
  tone,
  children,
}: {
  tone: keyof typeof TONE_ICON
  children: ReactNode
}) {
  const Icon = TONE_ICON[tone]
  return (
    <p className={`field-message field-message--${tone}`}>
      <Icon className="field-message__icon" size={16} strokeWidth={2} />
      <span>{children}</span>
    </p>
  )
}
