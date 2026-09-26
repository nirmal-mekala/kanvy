// Top bar: brand wordmark, view-mode menu (eye icon), theme toggle,
// import/export — visual parity with the prototype's Toolbar.jsx. Zoom
// controls stay on the canvas itself (bottom-right overlay), matching the
// prototype's own Board.jsx placement, not this component.

import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  Download,
  Eye,
  List,
  ListClock,
  ListTodo,
  Moon,
  Settings,
  Sun,
  Upload,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ViewMode } from '../../colors/borderColor'
import { focusNodeIdAtom } from '../../state/atoms/focus'
import {
  accessModeAtom,
  settingsModalOpenAtom,
} from '../../state/atoms/networkSettings'
import { clearSelectionAtom } from '../../state/atoms/selection'
import { themeAtom, toggleThemeAtom } from '../../state/atoms/theme'
import { setViewModeAtom, viewModeAtom } from '../../state/atoms/viewMode'
import {
  boardAtom,
  loadImportedBoardAtom,
} from '../../state/history/boardHistoryAtom'
import { exportBoard, parseImportedBoard } from '../../state/persistence/import'
import { Breadcrumb } from '../breadcrumb/Breadcrumb'
import { Banner } from '../notifications/Banner'
import { SettingsModal } from '../settings/SettingsModal'

const VIEW_MODES: readonly {
  key: ViewMode
  label: string
  Icon: typeof List
}[] = [
  { key: 'standard', label: 'Standard', Icon: List },
  { key: 'task', label: 'Task', Icon: ListTodo },
  { key: 'recency', label: 'Recency', Icon: ListClock },
]

function downloadBoardJson(json: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kanvy-board-${timestamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// CRAP scoring penalizes this component's 0% coverage — component tests
// aren't a required tier for v0 (spec §13); real coverage comes from
// e2e/visual-regression specs, same precedent as CardBody/Container/Canvas.
// fallow-ignore-next-line complexity
export function Toolbar({ boardId }: { boardId: string }) {
  const [board] = useAtom(boardAtom)
  const [theme] = useAtom(themeAtom)
  const toggleTheme = useSetAtom(toggleThemeAtom)
  const [viewMode] = useAtom(viewModeAtom)
  const setViewMode = useSetAtom(setViewModeAtom)
  const loadImportedBoard = useSetAtom(loadImportedBoardAtom)
  const clearSelection = useSetAtom(clearSelectionAtom)
  const setFocusNodeId = useSetAtom(focusNodeIdAtom)

  const accessMode = useAtomValue(accessModeAtom)
  const [settingsOpen, setSettingsOpen] = useAtom(settingsModalOpenAtom)

  const [menuOpen, setMenuOpen] = useState(false)
  const [importError, setImportError] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  function handleDownload() {
    downloadBoardJson(exportBoard(board))
  }

  function handleImportClick() {
    importInputRef.current?.click()
  }

  // Replacing the whole board makes the old selection/focus request almost
  // certainly stale (spec §9/Q14's import path).
  async function handleImportFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const result = parseImportedBoard(await file.text())
    if (!result.ok) {
      setImportError(true)
      return
    }
    loadImportedBoard(result.board)
    clearSelection()
    setFocusNodeId(null)
  }

  return (
    <>
      {importError && (
        <Banner
          message="Could not import that file — is it a Kanvy JSON export?"
          onDismiss={() => setImportError(false)}
        />
      )}
      {settingsOpen && <SettingsModal />}
      <div className="toolbar">
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportFileChange}
          style={{ display: 'none' }}
        />
        <span className="toolbar__brand">kanvy</span>
        <Breadcrumb boardId={boardId} />

        <div className="toolbar__view-menu-wrap" ref={wrapRef}>
          <button
            type="button"
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
                  type="button"
                  key={key}
                  className={`toolbar__view-menu-item${viewMode === key ? ' toolbar__view-menu-item--active' : ''}`}
                  onClick={() => {
                    setViewMode(key)
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
          type="button"
          className="toolbar__btn toolbar__btn--icon"
          onClick={() => toggleTheme()}
          title={
            theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          }
        >
          {theme === 'dark' ? (
            <Sun size={16} strokeWidth={2} />
          ) : (
            <Moon size={16} strokeWidth={2} />
          )}
        </button>

        {accessMode !== 'network' && (
          <button
            type="button"
            className="toolbar__btn toolbar__btn--icon"
            onClick={handleImportClick}
            title="Import a board from a JSON file"
          >
            <Upload size={16} strokeWidth={2} />
          </button>
        )}

        <button
          type="button"
          className="toolbar__btn toolbar__btn--icon"
          onClick={handleDownload}
          title="Download the board as a JSON file"
        >
          <Download size={16} strokeWidth={2} />
        </button>

        <button
          type="button"
          className="toolbar__btn toolbar__btn--icon"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
        >
          <Settings size={16} strokeWidth={2} />
        </button>
      </div>
    </>
  )
}
