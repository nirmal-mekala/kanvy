// Wires the pure trigger-detection/search/variant logic above into a
// stateful hook any `<input>`/`<textarea>` field can adopt: call
// `handleChange`/`handleBlur` from the field's own event handlers, spread
// `handleKeyDown` into its `onKeyDown` (checking the returned "consumed"
// flag before running the field's own key handling), and render
// `<EmojiSuggestionMenu>` (../components/emoji/EmojiSuggestionMenu) when
// `view.isOpen`. BoardNameEditor.tsx and CardBody.tsx are the two current
// adopters.
//
// CRAP scoring penalizes this hook's 0% coverage — component/interaction
// tests aren't a required tier for v0 (spec §13); the pure logic it calls
// (emojiTrigger.ts, searchEmoji.ts, variantList.ts, variantPreference.ts)
// is unit-tested directly, and real interaction coverage comes from e2e
// (e2e/*.spec.ts), which fallow's static analysis can't see.
// fallow-ignore-next-line complexity

import type { KeyboardEvent, RefObject } from 'react'
import { useLayoutEffect, useState } from 'react'
import { getCaretCoordinates } from './caretPosition'
import { loadEmojiEntries } from './emojiData'
import { findEmojiTrigger } from './emojiTrigger'
import type { EmojiEntry } from './emojiTypes'
import { graphemeStartBefore } from './graphemeBackspace'
import { searchEmoji } from './searchEmoji'
import {
  buildVariantGrid,
  findDefaultCell,
  hasVariants,
  type VariantGrid,
} from './variantList'
import { getPreferredVariant, setPreferredVariant } from './variantPreference'

type Field = HTMLInputElement | HTMLTextAreaElement
type Position = { top: number; left: number; height: number }

interface BaseState {
  matchStart: number
  matchEnd: number
  results: EmojiEntry[]
  activeIndex: number
  position: Position
}

interface ListState extends BaseState {
  mode: 'list'
}

interface VariantsState extends BaseState {
  mode: 'variants'
  grid: VariantGrid
  row: number
  col: number
}

type OpenState = ListState | VariantsState

export interface EmojiTriggerView {
  isOpen: boolean
  mode: 'list' | 'variants'
  results: readonly EmojiEntry[]
  activeIndex: number
  grid: VariantGrid | null
  row: number
  col: number
  position: Position | null
}

export interface EmojiTriggerHandlers {
  handleChange: () => void
  handleKeyDown: (e: KeyboardEvent<Field>) => boolean
  handleBlur: () => void
  selectResult: (index: number) => void
  selectVariant: (row: number, col: number) => void
}

function wrap(value: number, length: number): number {
  return ((value % length) + length) % length
}

export function useEmojiTrigger<El extends Field>(
  fieldRef: RefObject<El | null>,
  onInsert: (newValue: string, cursorPosition: number) => void,
): [EmojiTriggerView, EmojiTriggerHandlers] {
  const [state, setState] = useState<OpenState | null>(null)
  const [pendingCursor, setPendingCursor] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (pendingCursor === null) return
    fieldRef.current?.setSelectionRange(pendingCursor, pendingCursor)
    setPendingCursor(null)
  }, [pendingCursor, fieldRef])

  function recompute(el: Field) {
    const cursor = el.selectionStart ?? el.value.length
    const match = findEmojiTrigger(el.value, cursor)
    if (!match || match.query.length === 0) {
      setState(null)
      return
    }
    // CRAP-exempt, see the file-top note.
    // fallow-ignore-next-line complexity
    loadEmojiEntries().then((entries) => {
      const currentCursor = el.selectionStart ?? el.value.length
      const currentMatch = findEmojiTrigger(el.value, currentCursor)
      if (!currentMatch || currentMatch.query.length === 0) return
      const results = searchEmoji(currentMatch.query, entries)
      if (results.length === 0) {
        setState(null)
        return
      }
      setState({
        mode: 'list',
        matchStart: currentMatch.start,
        matchEnd: currentMatch.end,
        results,
        activeIndex: 0,
        position: getCaretCoordinates(el, currentMatch.start),
      })
    })
  }

  function handleChange() {
    const el = fieldRef.current
    if (el) recompute(el)
  }

  function handleBlur() {
    setState(null)
  }

  /**
   * Takes over Backspace when the cursor sits right after a multi-
   * codepoint grapheme (a skin-tone/ZWJ-joined emoji) so it's deleted in
   * one keystroke, matching typical apps — see graphemeBackspace.ts. A
   * plain single-code-unit character is left to the field's native
   * handling (this only ever *takes over*, never blocks, ordinary
   * backspacing). Mutating `el.value`/selection directly (rather than the
   * `pendingCursor` mechanism `insertChar` uses) mirrors what the browser
   * would have done natively, since there's no native edit event here to
   * piggyback on — `onInsert`'s subsequent React re-render with the same
   * string is a no-op that leaves it in place.
   */
  // CRAP-exempt, see the file-top note.
  // fallow-ignore-next-line complexity
  function handleBackspace(): boolean {
    const el = fieldRef.current
    if (!el || el.selectionStart !== el.selectionEnd) return false
    const cursor = el.selectionStart ?? 0
    if (cursor === 0) return false
    const start = graphemeStartBefore(el.value, cursor)
    if (cursor - start <= 1) return false
    const newValue = el.value.slice(0, start) + el.value.slice(cursor)
    el.value = newValue
    el.setSelectionRange(start, start)
    onInsert(newValue, start)
    recompute(el)
    return true
  }

  function insertChar(current: BaseState, char: string) {
    const el = fieldRef.current
    if (!el) return
    const value = el.value
    const newValue =
      value.slice(0, current.matchStart) + char + value.slice(current.matchEnd)
    const cursorPos = current.matchStart + char.length
    setPendingCursor(cursorPos)
    setState(null)
    onInsert(newValue, cursorPos)
  }

  function openVariants(current: ListState, entry: EmojiEntry) {
    const grid = buildVariantGrid(entry)
    const cell = findDefaultCell(grid, getPreferredVariant())
    setState({
      ...current,
      mode: 'variants',
      grid,
      row: cell.row,
      col: cell.col,
    })
  }

  function confirmListIndex(current: ListState, index: number) {
    const entry = current.results[index]
    if (!entry) return
    if (hasVariants(entry)) {
      openVariants(current, entry)
      return
    }
    insertChar(current, entry.char)
  }

  function confirmVariantCell(
    current: VariantsState,
    row: number,
    col: number,
  ) {
    const cell = current.grid.cells[row]?.[col]
    if (!cell) return
    insertChar(current, cell.char)
    setPreferredVariant({ gender: cell.gender, tone: cell.tone })
  }

  function selectResult(index: number) {
    if (state?.mode === 'list') confirmListIndex(state, index)
  }

  function selectVariant(row: number, col: number) {
    if (state?.mode === 'variants') confirmVariantCell(state, row, col)
  }

  function moveListActive(delta: number) {
    if (state?.mode !== 'list' || state.results.length === 0) return
    setState({
      ...state,
      activeIndex: wrap(state.activeIndex + delta, state.results.length),
    })
  }

  function moveVariantCell(rowDelta: number, colDelta: number) {
    if (state?.mode !== 'variants') return
    setState({
      ...state,
      row: wrap(state.row + rowDelta, state.grid.genders.length),
      col: wrap(state.col + colDelta, state.grid.tones.length),
    })
  }

  function backToList(current: VariantsState) {
    setState({
      mode: 'list',
      matchStart: current.matchStart,
      matchEnd: current.matchEnd,
      results: current.results,
      activeIndex: current.activeIndex,
      position: current.position,
    })
  }

  // CRAP-exempt, see the file-top note.
  // fallow-ignore-next-line complexity
  function handleListKeyDown(current: ListState, key: string): boolean {
    if (key === 'ArrowDown') {
      moveListActive(1)
      return true
    }
    if (key === 'ArrowUp') {
      moveListActive(-1)
      return true
    }
    if (key === 'Enter' || key === 'Tab') {
      confirmListIndex(current, current.activeIndex)
      return true
    }
    if (key === 'Escape') {
      setState(null)
      return true
    }
    return false
  }

  // CRAP-exempt, see the file-top note.
  // fallow-ignore-next-line complexity
  function handleVariantsKeyDown(current: VariantsState, key: string): boolean {
    if (key === 'ArrowDown') {
      moveVariantCell(1, 0)
      return true
    }
    if (key === 'ArrowUp') {
      moveVariantCell(-1, 0)
      return true
    }
    if (key === 'ArrowRight') {
      moveVariantCell(0, 1)
      return true
    }
    if (key === 'ArrowLeft') {
      moveVariantCell(0, -1)
      return true
    }
    if (key === 'Enter' || key === 'Tab') {
      confirmVariantCell(current, current.row, current.col)
      return true
    }
    if (key === 'Escape') {
      backToList(current)
      return true
    }
    return false
  }

  // CRAP-exempt, see the file-top note.
  // fallow-ignore-next-line complexity
  function handleKeyDown(e: KeyboardEvent<Field>): boolean {
    if (e.key === 'Backspace' && handleBackspace()) return true
    if (!state) return false
    const consumed =
      state.mode === 'list'
        ? handleListKeyDown(state, e.key)
        : handleVariantsKeyDown(state, e.key)
    return consumed
  }

  const view: EmojiTriggerView =
    state?.mode === 'variants'
      ? {
          isOpen: true,
          mode: 'variants',
          results: state.results,
          activeIndex: state.activeIndex,
          grid: state.grid,
          row: state.row,
          col: state.col,
          position: state.position,
        }
      : state
        ? {
            isOpen: true,
            mode: 'list',
            results: state.results,
            activeIndex: state.activeIndex,
            grid: null,
            row: 0,
            col: 0,
            position: state.position,
          }
        : {
            isOpen: false,
            mode: 'list',
            results: [],
            activeIndex: 0,
            grid: null,
            row: 0,
            col: 0,
            position: null,
          }

  return [
    view,
    { handleChange, handleKeyDown, handleBlur, selectResult, selectVariant },
  ]
}
