// Guarded localStorage. Some browsers throw on access (Safari "block all cookies", certain
// webviews, storage-partitioned iframes) rather than returning null; an unguarded read at
// module scope — as the prefs modules do — would then throw during import and blank the app
// before it mounts, with no PhaseBoundary to catch it. Every caller has a sensible absent-key
// default, so swallowing the error degrades (the choice just doesn't persist) instead of
// failing. Not re-exported from the barrel — `player/` and `prefs/` import it directly.

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  }
  catch {
    return null
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  }
  catch { /* storage unavailable — the choice just doesn't persist */ }
}

export function removeStored(key: string): void {
  try {
    localStorage.removeItem(key)
  }
  catch { /* storage unavailable */ }
}

export function storedKeys(): string[] {
  try {
    return Object.keys(localStorage)
  }
  catch {
    return []
  }
}
