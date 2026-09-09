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
