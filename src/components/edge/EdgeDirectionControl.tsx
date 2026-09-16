// Direction toggle for the currently selected edge(s) (spec §4.6) — the
// edges half of the selection menu (`components/selection-menu/`
// covers the node half), kept separate since edges never share the
// color/pattern/task sections. `direction` is `null` for a mixed-direction
// multi-edge selection (spec §4.3's "one selection menu for the whole
// selection, however mixed" — no option reads as falsely "active" then).

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
  direction: EdgeDirection | null
  onChange: (direction: EdgeDirection) => void
}) {
  return (
    <div
      className="edge-direction-control"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
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
