import { ref } from 'vue'
import { withViewTransition } from './motion'

// The theme switch. Module-level like `lib/dialog.ts` — one theme per document.
//
// `_theme.scss` owns "follow the OS" via `prefers-color-scheme`, so that path needs
// no JS and can't flash. This only ever writes an *explicit* choice.

const KEY = 'pixmaler:theme'

export type Theme = 'dark' | 'light'

// Absent means "no choice made", not "dark". Unrecognised values degrade to absent.
function storedTheme(): Theme | null {
  const raw = localStorage.getItem(KEY)
  return raw === 'dark' || raw === 'light' ? raw : null
}

const systemLight = matchMedia('(prefers-color-scheme: light)')

function systemTheme(): Theme {
  return systemLight.matches ? 'light' : 'dark'
}

/** What's on screen right now, whether chosen or inherited from the OS. */
export const theme = ref<Theme>(storedTheme() ?? systemTheme())

// `index.html` does this before first paint; repeated here so the module stands alone.
const explicit = storedTheme()
if (explicit)
  document.documentElement.dataset.theme = explicit

// Follow the OS only while the user hasn't chosen.
systemLight.addEventListener('change', () => {
  if (!storedTheme())
    theme.value = systemTheme()
})

// Cross-faded via a View Transition: every colour on screen changes at once, and an
// instant swap reads as a flicker. The whole document is the transition, so the
// default `root` snapshot does the work — CSS only tunes its duration.
export function toggleTheme(): void {
  const next: Theme = theme.value === 'dark' ? 'light' : 'dark'
  withViewTransition(() => {
    theme.value = next
    localStorage.setItem(KEY, next)
    document.documentElement.dataset.theme = next
  }, 'theme')
}
