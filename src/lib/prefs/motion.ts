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
  // A skipped transition — the tab was backgrounded, or a newer transition superseded this
  // one — rejects `ready` with AbortError. Swallow it (regardless of `name`, since even a
  // nameless call starts a transition that can be skipped) so it never surfaces as an
  // unhandled promise rejection.
  transition.ready.catch(() => {})
  // `finished` *resolves* even on a skip, so cleanup always runs; a genuine throw inside
  // `mutate` still rejects it and surfaces, which is what we want.
  if (name)
    transition.finished.finally(() => { delete root.dataset[`${name}Vt`] })
}
