import { ref } from 'vue'

// "Touch mode" — larger, drag-free interaction for coarse pointers, decoupled from the
// width-based `isMobile` (which stays a pure layout/space signal). Module-level like the
// other prefs.
//
// Silent by default: `(pointer: coarse)` decides until the user chooses in settings, and
// only an explicit choice is stored — the same shape as `theme.ts`. There is deliberately
// no first-run prompt: theme, text size and motion all detect silently and offer a toggle,
// and a coarse *primary* pointer gets the common case right. `pointer` (not `any-pointer`)
// so a touch laptop driven by its trackpad stays off unless the user opts in.

const KEY = 'pixmaler:touch'

// Absent means "no choice made", not "off". Unrecognised values degrade to absent.
function stored(): boolean | null {
  const raw = localStorage.getItem(KEY)
  return raw === 'on' ? true : raw === 'off' ? false : null
}

const coarse = matchMedia('(pointer: coarse)')

/** Whether touch-friendly interaction is in effect now, chosen or inherited from the device. */
export const isTouch = ref<boolean>(stored() ?? coarse.matches)

// Follow the device only while the user hasn't chosen.
coarse.addEventListener('change', () => {
  if (stored() === null)
    isTouch.value = coarse.matches
})

export function toggleTouch(): void {
  const next = !isTouch.value
  isTouch.value = next
  localStorage.setItem(KEY, next ? 'on' : 'off')
}
