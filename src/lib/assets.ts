// Resolve paths against Vite's base (e.g. "/pixmaler/") so they work under the deploy subpath.

const BASE = import.meta.env.BASE_URL

// A public/ asset: asset('assets/icons/star.svg') → '/pixmaler/assets/icons/star.svg'.
export function asset(path: string): string {
  return `${BASE}${path}`
}

// An in-app route href: appHref('paint') → '/pixmaler/paint', appHref() → '/pixmaler/'.
export function appHref(path = ''): string {
  return `${BASE.replace(/\/+$/, '')}/${path}`
}

// A room URL on the current path, query-escaped so a room code containing `&`/`#` can't
// inject params (#66: an unescaped code could forge `create=1` and conjure a room). Create
// intent rides as a param that `App.vue` strips on arrival.
export function roomHref(room: string, opts: { create?: boolean } = {}): string {
  const params = new URLSearchParams({ room })
  if (opts.create)
    params.set('create', '1')
  return `${location.pathname}?${params}`
}
