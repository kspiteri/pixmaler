import { ref } from 'vue'
import { readStored, removeStored, writeStored } from '../storage'

// The tools-panel's size (S / M / L) and its desktop placement (float / side / bottom),
// persisted per browser so the palette returns the way you left it. Module-level like the
// other prefs.
//
// The panel is JS-rendered (never in the first paint), so unlike theme/textScale these
// need no pre-paint application in `index.html`. Each default stores nothing — an absent
// key means the default, the same way an unset theme means "follow the OS".

const SIZE_KEY = 'pixmaler:paletteSize'
const PLACEMENT_KEY = 'pixmaler:palettePlacement'
// The retired dock boolean (#59). Read once to migrate, then dropped on the next write.
const LEGACY_DOCK_KEY = 'pixmaler:paletteDocked'

export type PaletteSize = 'sm' | 'md' | 'lg'
const SIZES: readonly PaletteSize[] = ['sm', 'md', 'lg']
const DEFAULT_SIZE: PaletteSize = 'md'

// Where the desktop palette sits. `float` draggable over the canvas (default), `side` an
// in-flow rail beside it, `bottom` a centred bar under it. Mobile ignores this — it always
// docks full-width at the bottom.
export type PalettePlacement = 'float' | 'side' | 'bottom'
const PLACEMENTS: readonly PalettePlacement[] = ['float', 'side', 'bottom']
const DEFAULT_PLACEMENT: PalettePlacement = 'float'

function storedSize(): PaletteSize {
  const raw = readStored(SIZE_KEY) as PaletteSize | null
  return raw && SIZES.includes(raw) ? raw : DEFAULT_SIZE
}

function storedPlacement(): PalettePlacement {
  const raw = readStored(PLACEMENT_KEY) as PalettePlacement | null
  if (raw && PLACEMENTS.includes(raw))
    return raw
  // Migrate the old boolean: a docked panel becomes the side rail; absent means float.
  if (readStored(LEGACY_DOCK_KEY) === 'docked')
    return 'side'
  return DEFAULT_PLACEMENT
}

/** The swatch/panel size in effect right now. */
export const paletteSize = ref<PaletteSize>(storedSize())

/** Where the desktop palette sits right now. */
export const palettePlacement = ref<PalettePlacement>(storedPlacement())

export function setPaletteSize(size: PaletteSize): void {
  if (!SIZES.includes(size))
    return
  paletteSize.value = size
  if (size === DEFAULT_SIZE)
    removeStored(SIZE_KEY)
  else
    writeStored(SIZE_KEY, size)
}

export function setPalettePlacement(placement: PalettePlacement): void {
  if (!PLACEMENTS.includes(placement))
    return
  palettePlacement.value = placement
  if (placement === DEFAULT_PLACEMENT)
    removeStored(PLACEMENT_KEY)
  else
    writeStored(PLACEMENT_KEY, placement)
  // Supersede the retired boolean so it can't shadow a later read.
  removeStored(LEGACY_DOCK_KEY)
}
