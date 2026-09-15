import { useCallback, useEffect, useRef, useState } from 'react'
import { useBoard } from './state/useBoard.js'
import { useTheme } from './state/useTheme.js'
import { useViewMode } from './state/useViewMode.js'
import { isEditableTarget } from './utils/dom.js'
import { processImageFile, getImageFileFromClipboard } from './utils/image.js'
import { isPlainUrl } from './utils/link.js'
import { fetchLinkMetadata } from './utils/linkMetadata.js'
import Board from './components/Board.jsx'
import Toolbar from './components/Toolbar.jsx'

export default function App() {
  const {
    board,
    addCard,
    addImageCard,
    convertCardToImage,
    addLinkCard,
    convertCardToLink,
    addGroup,
    addEdge,
    duplicateCards,
    copySelection,
    pasteClipboard,
    updateCard,
    moveCard,
    updateGroup,
    updateEdge,
    removeItems,
    loadBoard,
    undo,
    redo,
  } = useBoard()
  const { theme, toggleTheme } = useTheme()
  const { viewMode, setViewMode } = useViewMode()
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [focusCardId, setFocusCardId] = useState(null)
  const boardRef = useRef(null)
  const importInputRef = useRef(null)

  // System-clipboard integration is layered on top of the existing in-app
  // copy/paste, not a replacement for it — see the `paste` listener below
  // for when each path is used.
  const writeSelectionTextToSystemClipboard = useCallback(
    (ids) => {
      if (!navigator.clipboard?.writeText) return
      const idSet = new Set(ids)
      const text = board.cards
        .filter((c) => idSet.has(c.id) && c.content.trim())
        .map((c) => c.content)
        .join('\n\n')
      // Never overwrite the user's system clipboard with nothing just
      // because the selection had no text (e.g. it was only grouping boxes).
      if (!text) return
      navigator.clipboard.writeText(text).catch(() => {
        // Permission denied or unavailable — the in-app copy already
        // succeeded, so there's nothing more to do here.
      })
    },
    [board],
  )

  // Fires off the microlink.io lookup for a freshly created/converted link
  // node and fills in the result once it resolves — updateCard is a no-op
  // if the card's since been deleted, so there's nothing to guard here.
  const applyLinkMetadata = useCallback(
    (id, url) => {
      fetchLinkMetadata(url)
        .then(({ title, imageUrl }) => updateCard(id, { linkTitle: title, linkImageUrl: imageUrl, linkStatus: 'ready' }))
        .catch(() => updateCard(id, { linkStatus: 'error' }))
    },
    [updateCard],
  )

  // A URL typed into a plain text note is "slurped" out of it into a link
  // node — see findSlurpableUrl (utils/link.js) for exactly when this fires,
  // and convertCardToLink (useBoard.js) for why it's a no-op on an image or
  // link node's own text.
  const handleSlurpLink = useCallback(
    (id, url, remainingContent) => {
      convertCardToLink(id, url, remainingContent)
      applyLinkMetadata(id, url)
    },
    [convertCardToLink, applyLinkMetadata],
  )

  // Deliberately *not* using navigator.clipboard.readText() here — calling
  // it programmatically makes Safari (and possibly others) show its own
  // clipboard-access confirmation popup before resolving, which reads as an
  // extra "are you sure" step instead of a direct paste. Reading from the
  // actual native `paste` event's clipboardData is exempt from that, since
  // it's tied directly to the user's real Cmd/Ctrl+V gesture rather than an
  // arbitrary script-initiated read.
  useEffect(() => {
    // Which card (if any) a paste should act on: the one being edited, or —
    // with nothing focused — the sole selected card. Shared by the image
    // and link branches below; `null` means "create a new node instead".
    function resolveTargetCard(e) {
      const id = isEditableTarget(e.target)
        ? e.target.closest('[data-node-id]')?.dataset.nodeId
        : selectedIds.size === 1
          ? [...selectedIds][0]
          : null
      return id ? (board.cards.find((c) => c.id === id) ?? null) : null
    }

    function onPaste(e) {
      const imageFile = getImageFileFromClipboard(e.clipboardData)
      if (imageFile) {
        const targetCard = resolveTargetCard(e)
        // Images and links are mutually exclusive node kinds — pasting an
        // image into an existing link node's text does nothing (falls
        // through to a literal text paste if editing, otherwise is just
        // ignored), rather than converting it.
        if (targetCard?.linkUrl) return
        // A pasted image always wins over any text also on the clipboard,
        // and always converts/creates rather than falling through to the
        // text path below. preventDefault happens synchronously, before the
        // async decode, so the browser's own paste action never proceeds.
        e.preventDefault()
        processImageFile(imageFile).then(({ dataUri }) => {
          if (targetCard) convertCardToImage(targetCard.id, dataUri)
          else boardRef.current?.pasteImageAsCard(dataUri)
        })
        return
      }

      const text = e.clipboardData?.getData('text/plain')
      if (text && isPlainUrl(text)) {
        const url = text.trim()
        const targetCard = resolveTargetCard(e)
        // Same mutual-exclusion as above, the other direction: pasting a
        // link into an existing image (or link) node's text does nothing.
        if (targetCard?.imageId || targetCard?.linkUrl) return
        e.preventDefault()
        if (targetCard) {
          convertCardToLink(targetCard.id, url)
          applyLinkMetadata(targetCard.id, url)
        } else {
          boardRef.current?.pasteLinkAsCard(url)
        }
        return
      }

      if (isEditableTarget(e.target)) return // let native textarea paste happen

      // Nothing on the clipboard needed conversion — with something
      // selected (a border, a card that isn't focused, whatever), that
      // means continuing the in-app node copy/paste instead of touching
      // the system clipboard's plain text at all.
      if (selectedIds.size > 0) {
        e.preventDefault()
        const { ids: newIds, box } = pasteClipboard()
        if (newIds.length) {
          setSelectedIds(new Set(newIds))
          boardRef.current?.panIntoView(box)
        }
        return
      }

      // Already just the plain-text flavor — any rich formatting is
      // discarded automatically, per the requirement.
      if (!text || !text.trim()) return
      e.preventDefault()
      boardRef.current?.pasteTextAsCard(text)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [selectedIds, board, convertCardToImage, convertCardToLink, applyLinkMetadata, pasteClipboard])

  useEffect(() => {
    function onKeyDown(e) {
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      // Undo/redo work regardless of selection, but not while typing in a
      // note — Cmd/Ctrl+Z there should be the browser's native text undo.
      if (mod && (key === 'z' || key === 'y') && !isEditableTarget(e.target)) {
        e.preventDefault()
        if (key === 'y' || e.shiftKey) redo()
        else undo()
        return
      }

      // Paste (Cmd/Ctrl+V) is handled entirely by the native `paste` event
      // listener above instead of here — it needs the actual clipboard
      // contents (to tell an image or a link apart from plain text) that
      // only that event carries, not just the key itself.

      if (selectedIds.size === 0) return

      if (mod && key === 'c' && !isEditableTarget(e.target)) {
        e.preventDefault()
        copySelection([...selectedIds])
        writeSelectionTextToSystemClipboard([...selectedIds])
        return
      }

      if (mod && key === 'd') {
        e.preventDefault()
        const newIds = duplicateCards([...selectedIds])
        if (newIds.length) {
          setSelectedIds(new Set(newIds))
          // Jump straight into editing the duplicate rather than leaving it
          // just selected — matches how a fresh copy is usually meant to be
          // tweaked right away.
          setFocusCardId(newIds[0])
        }
        return
      }

      if (!mod && (e.key === 'Backspace' || e.key === 'Delete') && !isEditableTarget(e.target)) {
        e.preventDefault()
        removeItems([...selectedIds])
        setSelectedIds(new Set())
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    duplicateCards,
    copySelection,
    removeItems,
    selectedIds,
    undo,
    redo,
    writeSelectionTextToSystemClipboard,
  ])

  function handleCreateCard(x, y, content) {
    const id = addCard({ x, y, content })
    setSelectedIds(new Set([id]))
    setFocusCardId(id)
  }

  function handleCreateImageCard(x, y, dataUri) {
    const id = addImageCard({ x, y, dataUri })
    setSelectedIds(new Set([id]))
    setFocusCardId(id)
  }

  function handleCreateLinkCard(x, y, url) {
    const id = addLinkCard({ x, y, url })
    setSelectedIds(new Set([id]))
    setFocusCardId(id)
    applyLinkMetadata(id, url)
  }

  function handleCreateGroup(rect) {
    setSelectedIds(new Set([addGroup(rect)]))
  }

  function handleCreateEdge(fromId, fromSide, toId, toSide) {
    setSelectedIds(new Set([addEdge(fromId, fromSide, toId, toSide)]))
  }

  function handleDownload() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kanvy-board-${timestamp}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function handleImportClick() {
    importInputRef.current?.click()
  }

  // Goes through loadBoard -> the normal update()/history path (see
  // useBoard.js), so an import that turns out to be a mistake is just
  // another Ctrl/Cmd+Z away rather than something to confirm up front.
  async function handleImportFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // lets the same file be re-selected later
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      loadBoard(parsed)
      // The old selection almost certainly doesn't exist in the imported
      // board at all.
      setSelectedIds(new Set())
      setFocusCardId(null)
    } catch {
      window.alert('Could not import that file — is it a Kanvy JSON export?')
    }
  }

  return (
    <div className="app">
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImportFileChange}
        style={{ display: 'none' }}
      />
      <Toolbar
        onDownload={handleDownload}
        onImport={handleImportClick}
        theme={theme}
        onToggleTheme={toggleTheme}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <Board
        ref={boardRef}
        board={board}
        theme={theme}
        viewMode={viewMode}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onCreateCard={handleCreateCard}
        onCreateImageCard={handleCreateImageCard}
        onCreateLinkCard={handleCreateLinkCard}
        onSlurpLink={handleSlurpLink}
        onCreateGroup={handleCreateGroup}
        onCreateEdge={handleCreateEdge}
        focusCardId={focusCardId}
        actions={{ updateCard, moveCard, updateGroup, updateEdge }}
      />
    </div>
  )
}
