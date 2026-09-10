import { ref } from 'vue'

// The tools-panel's size (S / M / L) and its desktop dock/float choice, persisted per
// browser so the palette returns the way you left it. Module-level like the other prefs.
//
// The panel is JS-rendered (never in the first paint), so unlike theme/textScale these
// need no pre-paint application in `index.html`. Each default stores nothing — an absent
// key means the default, the same way an unset theme means "follow the OS".

const SIZE_KEY = 'pixmaler:paletteSize'
const DOCK_KEY = 'pixmaler:paletteDocked'

export type PaletteSize = 'sm' | 'md' | 'lg'
const SIZES: readonly PaletteSize[] = ['sm', 'md', 'lg']
const DEFAULT_SIZE: PaletteSize = 'md'

function storedSize(): PaletteSize {
  const raw = localStorage.getItem(SIZE_KEY) as PaletteSize | null
  return raw && SIZES.includes(raw) ? raw : DEFAULT_SIZE
}

/** The swatch/panel size in effect right now. */
export const paletteSize = ref<PaletteSize>(storedSize())

/** Whether the desktop palette is docked (true) or floating (false, the default). */
export const paletteDocked = ref(localStorage.getItem(DOCK_KEY) === 'docked')

export function setPaletteSize(size: PaletteSize): void {
  if (!SIZES.includes(size))
    return
  paletteSize.value = size
  if (size === DEFAULT_SIZE)
    localStorage.removeItem(SIZE_KEY)
  else
    localStorage.setItem(SIZE_KEY, size)
}

export function setPaletteDocked(docked: boolean): void {
  paletteDocked.value = docked
  if (docked)
    localStorage.setItem(DOCK_KEY, 'docked')
  else
    localStorage.removeItem(DOCK_KEY)
}
