// Motion preference, read at call time rather than cached — a user can flip the OS
// setting while the app is open. The CSS side guards itself with
// `@media (prefers-reduced-motion: reduce)`; this is for the JS-driven half, where a
// View Transition has to be skipped rather than merely un-eased.
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Run `mutate` inside a View Transition, falling back to a plain call where the API
 * is missing or motion is unwelcome. `name` sets `[data-<name>-vt]` on `<html>` for
 * the duration so CSS can pick keyframes, and always clears it.
 */
export function withViewTransition(mutate: () => void, name?: string): void {
  if (prefersReducedMotion() || !document.startViewTransition) {
    mutate()
    return
  }
  const root = document.documentElement
  if (name)
    root.dataset[`${name}Vt`] = ''
  const transition = document.startViewTransition(mutate)
  if (name)
    transition.finished.finally(() => { delete root.dataset[`${name}Vt`] })
}
