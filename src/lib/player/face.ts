// Generated avatar faces: DiceBear's notionists-neutral, rendered locally and seeded by the
// player's clientId. Loaded on first use, so a route with no chip never pays for it.

import { shallowRef } from 'vue'

// Fully transparent. The face is a CSS mask, so anything opaque but the ink lines would fill the chip.
const CLEAR = '00000000'

const renderer = shallowRef<((seed: string) => string) | null>(null)
const cache = new Map<string, string>()
let loading: Promise<void> | null = null

export function loadFaces(): Promise<void> {
  loading ??= Promise.all([
    import('@dicebear/core'),
    import('@dicebear/styles/notionists-neutral.json'),
  ]).then(([{ Avatar, Style }, { default: definition }]) => {
    const style = new Style(definition)
    renderer.value = seed => new Avatar(style, { seed, backgroundColor: CLEAR, paperColor: CLEAR }).toDataUri()
  }).catch(() => {
    loading = null
  })
  return loading
}

// The face as an SVG data URI, or null until the generator has loaded.
export function faceUri(seed: string): string | null {
  const render = renderer.value
  if (!render || !seed)
    return null
  let uri = cache.get(seed)
  if (!uri) {
    uri = render(seed)
    cache.set(seed, uri)
  }
  return uri
}

// A CSS `url()` to use as the face's mask, or null until the generator has loaded.
export function faceMask(seed: string): string | null {
  const uri = faceUri(seed)
  return uri ? `url("${uri}")` : null
}
