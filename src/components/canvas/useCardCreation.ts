// Card creation via double-click, image-file drop, and (for the two
// clipboard payload shapes spec §5.3/§5.4 tie directly to card-kind
// conversion) OS-clipboard image/URL paste. The rest of spec §7's paste
// priority order — in-app node clipboard, plain-text-paste-creates-a-card —
// is Stage 7's `clipboard/` module; this hook only owns what's inseparable
// from card-kind behavior itself.

import { useSetAtom } from 'jotai'
import type { RefObject } from 'react'
import { useEffect } from 'react'
import { applyLinkMetadata } from '../../cards/applyLinkMetadata'
import {
  convertToImageCard,
  convertToLinkCard,
  isConvertibleCard,
} from '../../cards/convertCardKind'
import {
  dataTransferHasFiles,
  getImageFileFromClipboard,
  getImageFilesFromDataTransfer,
  processImageFile,
} from '../../cards/imageFile'
import { newImageCard, newLinkCard, newTextCard } from '../../cards/newCard'
import { isPlainUrl } from '../../cards/urlSlurp'
import { generateId } from '../../schema/legacy'
import type { CardNode, Node, NodeId } from '../../schema/node'
import {
  addNodeAtom,
  replaceNodeAtom,
  updateLinkAtom,
} from '../../state/atoms/nodes'
import type { View } from './viewportCoords'
import { worldPoint } from './viewportCoords'

export function useCardCreation({
  nodesById,
  selection,
  view,
  boardElRef,
}: {
  nodesById: ReadonlyMap<NodeId, Node>
  selection: ReadonlySet<string>
  view: View
  boardElRef: RefObject<HTMLDivElement | null>
}) {
  const addNode = useSetAtom(addNodeAtom)
  const replaceNode = useSetAtom(replaceNodeAtom)
  const updateLink = useSetAtom(updateLinkAtom)

  function pointFromEvent(clientX: number, clientY: number) {
    return worldPoint(
      clientX,
      clientY,
      boardElRef.current?.getBoundingClientRect(),
      view,
    )
  }

  function viewportCenter() {
    const rect = boardElRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return worldPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      rect,
      view,
    )
  }

  // The card a paste should convert in place, per spec §5.3/§5.4: whichever
  // card's caption is actively focused, else the single selected card, if
  // any — never a container (containers aren't convertible) or a
  // multi-selection (ambiguous).
  // CRAP scoring penalizes this hook's functions for 0% coverage —
  // component/interaction tests aren't a required tier for v0 (spec §13);
  // real coverage comes from e2e (e2e/*.spec.ts), which fallow's static
  // analysis can't see. Same precedent as useBoardInteraction.ts (Stage 5).
  // fallow-ignore-next-line complexity
  function pasteTargetCard(): { id: NodeId; node: CardNode } | undefined {
    const focusedId = (
      document.activeElement as HTMLElement | null
    )?.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId
    if (focusedId) {
      const node = nodesById.get(focusedId)
      if (node?.type === 'card') return { id: focusedId, node }
    }
    if (selection.size === 1) {
      const [id] = selection
      const node = id !== undefined ? nodesById.get(id) : undefined
      if (id !== undefined && node?.type === 'card') return { id, node }
    }
    return undefined
  }

  function handleCanvasDoubleClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('[data-node-id]')) return
    const point = pointFromEvent(e.clientX, e.clientY)
    addNode(newTextCard(point.x, point.y))
  }

  function handleCanvasDragOver(e: React.DragEvent) {
    if (dataTransferHasFiles(e.dataTransfer)) e.preventDefault()
  }

  function handleCanvasDrop(e: React.DragEvent) {
    const files = getImageFilesFromDataTransfer(e.dataTransfer)
    const file = files[0]
    if (!file) return
    e.preventDefault()
    const point = pointFromEvent(e.clientX, e.clientY)
    processImageFile(file).then(({ dataUri, width, height }) => {
      const imageId = generateId()
      addNode(newImageCard(point.x, point.y, imageId, width / height), {
        id: imageId,
        dataUri,
      })
    })
  }

  function handleImagePaste(file: File) {
    const target = pasteTargetCard()
    processImageFile(file).then(({ dataUri, width, height }) => {
      const imageId = generateId()
      if (target) {
        if (!isConvertibleCard(target.node)) return // no-op: pasting an image into an image/link caption (spec §5.3)
        replaceNode(target.id, convertToImageCard(target.node, imageId), {
          id: imageId,
          dataUri,
        })
        return
      }
      const center = viewportCenter()
      addNode(newImageCard(center.x, center.y, imageId, width / height), {
        id: imageId,
        dataUri,
      })
    })
  }

  function handleUrlPaste(url: string) {
    const target = pasteTargetCard()
    if (target) {
      if (!isConvertibleCard(target.node)) return // no-op: pasting a URL into an image/link caption
      replaceNode(target.id, convertToLinkCard(target.node, url))
      applyLinkMetadata(target.id, url, updateLink)
      return
    }
    const center = viewportCenter()
    const card = newLinkCard(center.x, center.y, url)
    addNode(card)
    applyLinkMetadata(card.id, url, updateLink)
  }

  useEffect(() => {
    // fallow-ignore-next-line complexity
    function onPaste(e: ClipboardEvent) {
      const clipboardData = e.clipboardData
      if (!clipboardData) return
      const imageFile = getImageFileFromClipboard(clipboardData)
      if (imageFile) {
        e.preventDefault()
        handleImagePaste(imageFile)
        return
      }
      const text = clipboardData.getData('text/plain')
      if (text && isPlainUrl(text)) {
        e.preventDefault()
        handleUrlPaste(text.trim())
      }
      // Plain (non-URL) text paste — creating a new card or appending to a
      // focused caption via the browser's own native paste — is Stage 7's
      // `clipboard/` module (full OS-clipboard priority order, spec §7).
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  })

  return { handleCanvasDoubleClick, handleCanvasDragOver, handleCanvasDrop }
}
