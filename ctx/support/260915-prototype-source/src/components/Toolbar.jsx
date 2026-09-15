import { useEffect, useRef, useState } from 'react'
import { Download, Upload, Sun, Moon, Eye, List, ListTodo, ListClock } from 'lucide-react'

const VIEW_MODES = [
  { key: 'standard', label: 'Standard', Icon: List },
  { key: 'task', label: 'Task', Icon: ListTodo },
  { key: 'recency', label: 'Recency', Icon: ListClock },
]

export default function Toolbar({ onDownload, onImport, theme, onToggleTheme, viewMode, onViewModeChange }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e) {
      if (!wrapRef.current?.contains(e.target)) setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  return (
    <div className="toolbar">
      <span className="toolbar__brand">kanvy</span>

      {/* Anchors the right-aligned cluster of buttons (margin-left: auto is
          on this wrapper, not the button) — it goes first in that cluster
          so its dropdown, which grows rightward from here, has the other
          two buttons' width as breathing room instead of immediately
          hitting the edge of the window. */}
      <div className="toolbar__view-menu-wrap" ref={wrapRef}>
        <button
          className="toolbar__btn toolbar__btn--icon"
          onClick={() => setMenuOpen((open) => !open)}
          title="Change view mode"
        >
          <Eye size={16} strokeWidth={2} />
        </button>

        {menuOpen && (
          <div className="toolbar__view-menu">
            {VIEW_MODES.map(({ key, label, Icon }) => (
              <button
                key={key}
                className={`toolbar__view-menu-item${viewMode === key ? ' toolbar__view-menu-item--active' : ''}`}
                onClick={() => {
                  onViewModeChange(key)
                  setMenuOpen(false)
                }}
              >
                <Icon size={14} strokeWidth={2} />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        className="toolbar__btn toolbar__btn--icon"
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
      </button>

      <button
        className="toolbar__btn toolbar__btn--icon"
        onClick={onImport}
        title="Import a board from a JSON file"
      >
        <Upload size={16} strokeWidth={2} />
      </button>

      <button
        className="toolbar__btn toolbar__btn--icon"
        onClick={onDownload}
        title="Download the board as a JSON file"
      >
        <Download size={16} strokeWidth={2} />
      </button>
    </div>
  )
}
