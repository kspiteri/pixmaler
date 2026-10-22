// Winner confetti for the RESULTS reveal (#43). A thin wrapper over emoji-blast that owns an
// aria-hidden / inert / pointer-events:none layer, renders our own square confetti (seat-colour
// tokens) and award icons instead of native emoji, caps the whole effect at 5s and tears the layer
// down on demand. Lazy-loaded (dynamic import from RESULTS and the dev gallery) so emoji-blast
// never enters another route's chunk. No burst at all under reduced motion.
//
// emoji-blast resolves `position` once per blast, so a single call spawns one fountain; firing from
// each side of the hero gives the two-sided burst. Icons are baked static SVG — the themed border
// (GameIcon's `currentColor`) is dropped, since it can't read on a 30px particle in flight.

import { emojiBlast } from 'emoji-blast'
import { SEAT_COUNT } from './player/seats'
import { prefersReducedMotion } from './prefs/motion'

const HARD_CAP_MS = 5000
// Fade length ≈ opacityDecay × framerate(60) ms (emoji-blast's `opacity -= elapsed / (decay × fps)`),
// so ~60 is ~3.6 s. `opacityDecay` is in the types but not the public docs; it's stable in 0.12.
const DEFAULT_OPACITY_DECAY = 60

// Cap the particle count on weaker machines so the burst can't jank a low-end phone. Rough tiers
// from the two cheap signals browsers expose; `deviceMemory` is Chromium-only (GB), cores are broad.
export function maxParticles(): number {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = nav.hardwareConcurrency || 4
  if ((nav.deviceMemory !== undefined && nav.deviceMemory <= 2) || cores <= 2)
    return 24
  if ((nav.deviceMemory !== undefined && nav.deviceMemory <= 4) || cores <= 4)
    return 60
  return 120
}

// Static, theme-independent mirrors of GameIcon's shapes (fixed fills, no clip ids, no currentColor).
const CROWN = `<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M14 64 L16 34 L24 50 L32 26 L40 46 L48 22 L56 46 L64 26 L72 50 L80 34 L82 64 Z" fill="#FFC53D" stroke="#F5A312" stroke-width="2" stroke-linejoin="round"/><g fill="#F5A312"><circle cx="16" cy="34" r="4"/><circle cx="32" cy="26" r="4"/><circle cx="48" cy="22" r="4.5"/><circle cx="64" cy="26" r="4"/><circle cx="80" cy="34" r="4"/></g><rect x="12" y="63" width="72" height="15" rx="5" fill="#FFC53D" stroke="#F5A312" stroke-width="2"/><path d="M24 50 L28.5 55 L24 60 L19.5 55 Z" fill="#8BD450"/><rect x="31.5" y="50.5" width="9" height="9" rx="1.5" fill="#7B3FE4"/><path d="M48 50 L52.33 52.5 L52.33 57.5 L48 60 L43.67 57.5 L43.67 52.5 Z" fill="#EE3D8B"/><path d="M60 50 L64.5 59 L55.5 59 Z" fill="#8FB08A"/><path d="M72 50 L76.76 53.45 L74.94 59.05 L69.06 59.05 L67.24 53.45 Z" fill="#F5891E"/></svg>`
const FUNNIEST = `<svg viewBox="0 0 96 96" aria-hidden="true"><rect width="48" height="48" fill="#B4DD28"/><rect x="48" width="48" height="48" fill="#6C4CE6"/><rect y="48" width="48" height="48" fill="#EE3D8B"/><rect x="48" y="48" width="48" height="48" fill="#F5891E"/><g fill="none" stroke="#4A2E1C" stroke-width="5" stroke-linecap="round"><path d="M22 45 Q32 34 42 45"/><path d="M54 45 Q64 34 74 45"/></g><path d="M27 55 Q48 50 69 55 Q66 80 48 80 Q30 80 27 55 Z" fill="#4A2E1C"/><path d="M31 57 Q48 54 65 57 Q63 66 48 66 Q33 66 31 57 Z" fill="#fff"/></svg>`
const BEST = `<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M48 6 L61.52 33.39 L91.75 37.79 L68.93 54.8 L73.86 83.6 L48 70 L22.14 83.6 L27.07 54.8 L6.15 34.4 L35.06 30.2 Z" fill="#C8FF2D" stroke="#8CB320" stroke-width="5" stroke-linejoin="round"/></svg>`
const ICONS = [CROWN, FUNNIEST, BEST]

export interface ConfettiOptions {
  /** Launch source: an element (fountains from its two sides) or an absolute page point. */
  origin?: HTMLElement | { x: number, y: number }
  /** Total particle count across all launch points. */
  count?: number
  /** CSS colour values for the square confetti. Defaults to the full seat ramp (token vars). */
  colours?: string[]
  /** Share of particles (0–1) rendered as award icons rather than squares. */
  iconRatio?: number
  /** emoji-blast opacity decay; fade ≈ value × 60 ms. Defaults to a ~3.6 s fade. */
  opacityDecay?: number
}

function launchPoints(origin: ConfettiOptions['origin']): { x: number, y: number }[] {
  if (origin instanceof HTMLElement) {
    const r = origin.getBoundingClientRect()
    const y = r.top + r.height * 0.5
    return [{ x: r.left + 4, y }, { x: r.right - 4, y }]
  }
  if (origin)
    return [origin]
  return [{ x: window.innerWidth / 2, y: window.innerHeight * 0.3 }]
}

/** Fire one celebratory burst. Returns a cleanup that stops physics and removes the layer. */
export function fireConfetti(opts: ConfettiOptions = {}): () => void {
  if (prefersReducedMotion())
    return () => {}

  const colours = opts.colours ?? Array.from({ length: SEAT_COUNT }, (_, i) => `var(--player-colour-${i})`)
  const iconRatio = opts.iconRatio ?? 0.28
  const points = launchPoints(opts.origin)
  // Clamp the requested count to what the machine should handle, then split across launch points.
  const total = Math.min(opts.count ?? 48, maxParticles())
  const perPoint = Math.max(1, Math.round(total / points.length))

  const layer = document.createElement('div')
  layer.setAttribute('aria-hidden', 'true')
  layer.inert = true
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:2147483646'
  document.body.appendChild(layer)

  const process = (element: Element): void => {
    const el = element as HTMLElement
    el.textContent = ''
    el.style.cssText += ';border:none;padding:0;background:none;pointer-events:none'
    if (Math.random() < iconRatio) {
      el.innerHTML = ICONS[Math.floor(Math.random() * ICONS.length)]
      const svg = el.firstElementChild as SVGElement | null
      if (svg) {
        svg.style.width = '1em'
        svg.style.height = '1em'
        svg.style.display = 'block'
      }
    }
    else {
      el.style.width = '0.62em'
      el.style.height = '0.62em'
      el.style.background = colours[Math.floor(Math.random() * colours.length)]
      el.style.borderRadius = '1px'
    }
  }

  const stops = points.map(point => emojiBlast({
    container: layer,
    emojis: ['■'],
    uniqueness: 1,
    emojiCount: perPoint,
    position: point,
    process,
    physics: {
      gravity: { acceleration: 0.42 },
      opacityDecay: opts.opacityDecay ?? DEFAULT_OPACITY_DECAY,
      initialVelocities: { x: { min: -9, max: 9 }, y: { min: -21, max: -8 } },
    },
  }).stop)

  let done = false
  let timer = 0
  const cleanup = (): void => {
    if (done)
      return
    done = true
    clearTimeout(timer)
    for (const stop of stops)
      stop()
    layer.remove()
  }
  timer = window.setTimeout(cleanup, HARD_CAP_MS)
  return cleanup
}
