// Shared app-layout context — a tiny singleton reactive store for viewport
// facts that more than one component needs to agree on.
//
// Two facts live here today:
//   • `isMobile`      — are we below the mobile breakpoint (matchMedia-backed).
//   • `paletteHeight` — the docked palette's measured height in px (mobile only;
//                       0 when the palette floats / is absent).
//
// Why a shared store rather than props / a CSS var:
//   The DRAWING screen has to reconcile two independently-owned pieces — the
//   floating <PaletteTools> panel (which knows its own rendered height) and the
//   <CanvasPair> surface (which must size the editable canvas to whatever space
//   is left). Threading the palette height through a CSS custom property meant
//   only CSS could consume it; CanvasPair's JS fit-zoom (PixelCanvas.fitTo)
//   couldn't. Publishing it here lets CanvasPair compute the allowed canvas
//   area directly, and keeps `isMobile` in one place instead of each component
//   spinning up its own matchMedia listener.

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
