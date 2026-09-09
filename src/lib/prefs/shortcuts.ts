import { ref } from 'vue'

// The drawing-surface shortcuts (hold-Shift colour overlay, arrow-key colour cycling, wheel
// brush sizing, undo) as one on/off preference. Module-level like the other prefs.
//
// On by default — a power-user feature nobody opts into stays unused — this is the opt-out
// for anyone who finds the ambient wheel/arrow behaviour surprising. Only an explicit "off"
// is stored; absent (or anything unrecognised) means on. Desktop-only in the UI, but the
// flag is device-agnostic so a keyboard tablet honours it too.

const KEY = 'pixmaler:shortcuts'

export const shortcutsEnabled = ref(localStorage.getItem(KEY) !== 'off')

export function toggleShortcuts(): void {
  shortcutsEnabled.value = !shortcutsEnabled.value
  if (shortcutsEnabled.value)
    localStorage.removeItem(KEY)
  else
    localStorage.setItem(KEY, 'off')
}
