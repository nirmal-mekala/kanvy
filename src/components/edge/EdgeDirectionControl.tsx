// Minimal inline direction toggle for a selected edge (spec §4.6) — a full
// selection-menu UI (also covering color/pattern/task) is Stage 7's job;
// this is just enough to make `direction` settable now that edges can be
// created interactively.

import type { EdgeDirection } from '../../schema/edge'

const OPTIONS: { value: EdgeDirection; label: string; title: string }[] = [
  { value: 'none', label: '—', title: 'No direction' },
  { value: 'forward', label: '→', title: 'Forward' },
  { value: 'backward', label: '←', title: 'Backward' },
]

export function EdgeDirectionControl({
  x,
  y,
  direction,
  onChange,
}: {
  x: number
  y: number
  direction: EdgeDirection
  onChange: (direction: EdgeDirection) => void
}) {
  return (
    <div className="edge-direction-control" style={{ left: x, top: y }}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          className={`edge-direction-control__btn${
            direction === option.value
              ? ' edge-direction-control__btn--active'
              : ''
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
