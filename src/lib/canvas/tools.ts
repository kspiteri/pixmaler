// DOM tool widgets for a `PixelCanvas`: the colour swatch and the brush-size slider.
// Behaviour only — appearance lives in the consuming component's CSS, which is why these
// build bare elements with class names rather than carrying any styling of their own.

import type { PixelCanvas } from './pixel'
import { colorName } from './palette'

// ── Swatch ────────────────────────────────────────────────────────────────────

export interface SwatchHandle {
  element: HTMLElement
  count: number
  // Outline the swatch matching `index` to indicate "this is the colour at the
  // cell currently under the cursor". Pass null to clear.
  highlight: (index: number | null) => void
  // Programmatic pick — updates the visual and fires the same onSelect as a click,
  // so keyboard shortcuts and the mouse land in one place.
  select: (index: number) => void
  selectedIndex: () => number
  // Reveal/hide the per-swatch key badges for the hold-Shift quick-swap overlay.
  showKeys: (show: boolean) => void
  // Map a `KeyboardEvent.code` (Digit1…, KeyA…) to a swatch index, or null when the
  // code isn't one of the assigned quick keys.
  indexForKeyCode: (code: string) => number | null
}

// Quick-key pool for the hold-Shift overlay, in physical-keyboard order: the number row,
// then the three letter rows top to bottom. 36 slots cover the largest palette (32).
// `code`/`label` pairs so the mapping reads the physical key (Shift+1 is otherwise "!");
// the label is the QWERTY glyph, relabelled to the player's own layout in `buildSwatch`.
const KEY_POOL: { code: string, label: string }[] = [
  ...'1234567890'.split('').map(d => ({ code: `Digit${d}`, label: d })),
  ...'QWERTYUIOP'.split('').map(c => ({ code: `Key${c}`, label: c })),
  ...'ASDFGHJKL'.split('').map(c => ({ code: `Key${c}`, label: c })),
  ...'ZXCVBNM'.split('').map(c => ({ code: `Key${c}`, label: c })),
]

export function buildSwatch(
  palette: string[],
  onSelect: (index: number) => void,
): SwatchHandle {
  const wrap = document.createElement('div')
  wrap.className = 'swatch'
  // A set of single-select toggles: each cell reports its own pressed state, and the
  // group carries the context so a swatch reads as "red, pressed" rather than adrift.
  wrap.setAttribute('role', 'group')
  wrap.setAttribute('aria-label', 'Colours')

  const cells: HTMLElement[] = []
  const codeToIndex: Record<string, number> = {}
  let selectedIndex = 0
  let highlightedIndex: number | null = null

  function applyState() {
    cells.forEach((cell, i) => {
      const selected = i === selectedIndex
      cell.setAttribute('aria-pressed', String(selected))
      cell.classList.toggle('swatch__cell--selected', selected)
      cell.classList.toggle(
        'swatch__cell--highlighted',
        !selected && i === highlightedIndex,
      )
    })
  }

  // Roving tabindex: the whole group is one Tab stop that lands on the selected colour,
  // so Tab reaches the palette once rather than stopping on every cell.
  function applyRoving() {
    cells.forEach((cell, i) => {
      cell.tabIndex = i === selectedIndex ? 0 : -1
    })
  }

  function select(index: number) {
    selectedIndex = index
    applyState()
    applyRoving()
    onSelect(index)
  }

  palette.forEach((hex, i) => {
    const cell = document.createElement('button')
    cell.type = 'button'
    cell.className = 'swatch__cell'
    // Per-instance, so not reachable from CSS without a custom property — inline is the
    // right escape hatch here.
    cell.style.background = hex
    cell.title = hex
    // Name plus hex: the word carries the gist, and the hex tells apart the many swatches
    // that share a coarse name — a Mona Lisa palette has half a dozen "dark brown"s.
    cell.setAttribute('aria-label', `${colorName(hex)} (${hex})`)

    const key = KEY_POOL[i]
    if (key) {
      codeToIndex[key.code] = i
      const badge = document.createElement('span')
      badge.className = 'swatch__key'
      badge.setAttribute('aria-hidden', 'true')
      badge.textContent = key.label
      cell.appendChild(badge)
    }

    cell.addEventListener('click', () => select(i))
    cells.push(cell)
    wrap.appendChild(cell)
  })

  // Relabel the badges to the glyphs this device's physical keys actually produce, so an
  // AZERTY or Dvorak player sees their own keycaps rather than QWERTY's. Chromium-only;
  // the labels above stand everywhere else.
  const keyboard = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard
  keyboard?.getLayoutMap?.()?.then((map) => {
    cells.forEach((cell, i) => {
      const glyph = map.get(KEY_POOL[i]?.code ?? '')
      const badge = cell.querySelector('.swatch__key')
      if (badge && glyph)
        badge.textContent = glyph.toUpperCase()
    })
  }).catch(() => {})

  applyState()
  applyRoving()

  return {
    element: wrap,
    count: cells.length,
    select,
    selectedIndex: () => selectedIndex,
    highlight: (index: number | null) => {
      if (index === highlightedIndex)
        return
      highlightedIndex = index
      applyState()
    },
    showKeys: (show: boolean) => {
      wrap.classList.toggle('swatch--keys', show)
    },
    indexForKeyCode: code => (code in codeToIndex ? codeToIndex[code] : null),
  }
}

// ── Brush size ────────────────────────────────────────────────────────────────

export interface BrushHandle {
  element: HTMLElement
  // Re-read the canvas's brush size into the slider and label after a shortcut
  // (`[` / `]`) changed it without going through the slider's own input event.
  sync: () => void
}

export function buildBrushControls(pc: PixelCanvas): BrushHandle {
  const wrap = document.createElement('div')
  wrap.className = 'brush'

  const slider = document.createElement('input')
  slider.className = 'brush__slider'
  slider.type = 'range'
  slider.min = '1'
  slider.max = String(pc.getBrushMax())
  slider.value = String(pc.getBrushSize())
  // Native range announces min/max/value; it only lacked a name.
  slider.setAttribute('aria-label', 'Brush size')

  const label = document.createElement('span')
  label.className = 'brush__label'
  // The slider already speaks its value, so the visible copy is decoration to AT.
  label.textContent = `brush: ${pc.getBrushSize()}`
  label.setAttribute('aria-hidden', 'true')

  function sync() {
    slider.value = String(pc.getBrushSize())
    label.textContent = `brush: ${pc.getBrushSize()}`
  }

  slider.addEventListener('input', () => {
    pc.setBrushSize(Number.parseInt(slider.value, 10))
    label.textContent = `brush: ${pc.getBrushSize()}`
  })

  wrap.append(slider, label)
  return { element: wrap, sync }
}
