import { ref } from 'vue'

// The text-size control. Module-level like `lib/theme.ts` — one scale per document.
//
// The whole UI is authored in `rem`, so scaling the root font-size grows type,
// spacing and rem-based layout together: a text-led zoom rather than a text-only one.
// It builds on the *browser's* own default size (`_backdrop.scss` sets the root to
// `calc(100% * var(--text-scale))`), so a reader who has already raised their browser
// default keeps that as the 100 % baseline. Only an explicit choice is stored, and
// `index.html` applies it before first paint so type doesn't reflow on load.

const KEY = 'pixmaler:textScale'

// Percentage rungs. 100 is the default and stores nothing — the same way an unset
// theme means "follow the OS" rather than "dark".
export const SCALE_STEPS = [90, 100, 110, 125, 150] as const
const DEFAULT = 100

function storedScale(): number {
  const raw = Number(localStorage.getItem(KEY))
  return (SCALE_STEPS as readonly number[]).includes(raw) ? raw : DEFAULT
}

/** The scale in effect right now, as a percentage (100 = the browser default). */
export const textScale = ref<number>(storedScale())

// `index.html` does this before first paint; repeated here so the module stands alone.
document.documentElement.style.setProperty('--text-scale', String(textScale.value / 100))

export function setScale(pct: number): void {
  if (!(SCALE_STEPS as readonly number[]).includes(pct))
    return
  textScale.value = pct
  document.documentElement.style.setProperty('--text-scale', String(pct / 100))
  // Default stores nothing, so a returning reader on the default size carries no key.
  if (pct === DEFAULT)
    localStorage.removeItem(KEY)
  else
    localStorage.setItem(KEY, String(pct))
}

// Move one rung, clamped at the ends.
export function stepScale(dir: 1 | -1): void {
  const i = (SCALE_STEPS as readonly number[]).indexOf(textScale.value)
  setScale(SCALE_STEPS[Math.min(SCALE_STEPS.length - 1, Math.max(0, i + dir))])
}
