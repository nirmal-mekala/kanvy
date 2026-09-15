import { useEffect, useState } from 'react'

const STORAGE_KEY = 'kanvy-view-mode'
const VIEW_MODES = ['standard', 'task', 'recency']

function getInitialViewMode() {
  const stored = localStorage.getItem(STORAGE_KEY)
  return VIEW_MODES.includes(stored) ? stored : 'standard'
}

// Which "lens" the board is viewed through — standard (no extra styling),
// task (dims non-task items and recolors tasks by status), and recency
// (recolors every card/group border by how recently it was updated) — see
// Card.jsx and Group.jsx for both.
export function useViewMode() {
  const [viewMode, setViewMode] = useState(getInitialViewMode)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, viewMode)
  }, [viewMode])

  return { viewMode, setViewMode }
}
