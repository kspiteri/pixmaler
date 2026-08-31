// Shared app-layout context: a tiny reactive singleton for viewport facts more than one
// component must agree on — `isMobile` (matchMedia-backed) and `paletteHeight`.
//
// A store rather than a CSS custom property because `CanvasPair` needs the palette's
// height in *JS* to size the canvas via `PixelCanvas.fitTo`, and a CSS var is only
// readable from CSS. It also keeps one matchMedia listener instead of one per component.

import { ref } from 'vue'

// Mirror of $bp-mobile in styles/_tokens.scss.
export const MOBILE_BP = 640

// Below $bp-mobile the tools panel docks full-width to the bottom.
export const isMobile = ref(false)

// The docked palette's measured height in px. Set by <PaletteTools> while it's
// docked (mobile); reset to 0 when it floats (desktop) or unmounts. Consumers
// subtract this from the shell to get the canvas area's allowed height.
export const paletteHeight = ref(0)

let mql: MediaQueryList | null = null

function onMobileChange(e: MediaQueryListEvent | MediaQueryList) {
  isMobile.value = e.matches
}

// Idempotent: safe to call from every component that needs the context — the
// matchMedia listener is wired up only once, on first use.
export function useAppLayout() {
  if (!mql && typeof window !== 'undefined') {
    mql = window.matchMedia(`(max-width: ${MOBILE_BP}px)`)
    isMobile.value = mql.matches
    mql.addEventListener('change', onMobileChange)
  }
  return { isMobile, paletteHeight, setPaletteHeight, MOBILE_BP }
}

// Publish the docked palette height (px). Pass 0 to clear the reservation.
export function setPaletteHeight(px: number) {
  paletteHeight.value = Math.max(0, Math.round(px))
}
