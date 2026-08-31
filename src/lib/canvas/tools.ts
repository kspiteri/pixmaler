// DOM tool widgets for a `PixelCanvas`: the colour swatch and the brush-size slider.
// Behaviour only — appearance lives in the consuming component's CSS, which is why these
// build bare elements with class names rather than carrying any styling of their own.

import type { PixelCanvas } from './pixel'

// ── Swatch ────────────────────────────────────────────────────────────────────

export interface SwatchHandle {
  element: HTMLElement
  // Outline the swatch matching `index` to indicate "this is the colour at the
  // cell currently under the cursor". Pass null to clear.
  highlight: (index: number | null) => void
}

export function buildSwatch(
  palette: string[],
  onSelect: (index: number) => void,
): SwatchHandle {
  const wrap = document.createElement('div')
  wrap.className = 'swatch'

  const cells: HTMLElement[] = []
  let selectedIndex = 0
  let highlightedIndex: number | null = null

  function applyState() {
    cells.forEach((cell, i) => {
      cell.classList.toggle('swatch__cell--selected', i === selectedIndex)
      cell.classList.toggle(
        'swatch__cell--highlighted',
        i !== selectedIndex && i === highlightedIndex,
      )
    })
  }

  palette.forEach((hex, i) => {
    const cell = document.createElement('button')
    cell.type = 'button'
    cell.className = 'swatch__cell'
    // Per-instance, so not reachable from CSS without a custom property — inline is the
    // right escape hatch here.
    cell.style.background = hex
    cell.title = hex
    cell.addEventListener('click', () => {
      selectedIndex = i
      applyState()
      onSelect(i)
    })
    cells.push(cell)
    wrap.appendChild(cell)
  })

  // Apply initial state (first swatch selected by default).
  applyState()

  return {
    element: wrap,
    highlight: (index: number | null) => {
      if (index === highlightedIndex)
        return
      highlightedIndex = index
      applyState()
    },
  }
}

// ── Brush size ────────────────────────────────────────────────────────────────

export function buildBrushControls(pc: PixelCanvas): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'brush'

  const slider = document.createElement('input')
  slider.className = 'brush__slider'
  slider.type = 'range'
  slider.min = '1'
  slider.max = String(pc.getBrushMax())
  slider.value = String(pc.getBrushSize())

  const label = document.createElement('span')
  label.className = 'brush__label'
  label.textContent = `brush: ${pc.getBrushSize()}`

  slider.addEventListener('input', () => {
    pc.setBrushSize(Number.parseInt(slider.value, 10))
    label.textContent = `brush: ${pc.getBrushSize()}`
  })

  wrap.append(slider, label)
  return wrap
}
