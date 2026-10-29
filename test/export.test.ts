// Drawing export — the decisions a player sees: whether Save opens the share sheet or downloads,
// how big the PNG and the share card come out, and what the files are called.

import type { CardLayout } from '../src/lib/export/card'
import type { DeviceSignals } from '../src/lib/export/deliver'
import { describe, expect, it } from 'vitest'
import { cardLayout } from '../src/lib/export/card'
import { isHandheld, prefersShareSheet } from '../src/lib/export/deliver'
import { drawingFilename, exportSlug, paintFilename } from '../src/lib/export/filename'
import { exportScale } from '../src/lib/export/png'
import { GRID_MAX_SIDE } from '../src/lib/protocol/protocol'

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const FIREFOX_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'

function device(over: Partial<DeviceSignals>): DeviceSignals {
  return { uaMobile: undefined, uaPlatform: undefined, userAgent: FIREFOX_UA, maxTouchPoints: 0, coarsePointer: false, ...over }
}

describe('isHandheld', () => {
  it('trusts userAgentData over the pointer when Chromium reports it', () => {
    // A touchscreen laptop has a coarse pointer but is still a desktop: Save must download.
    expect(isHandheld(device({ uaMobile: false, uaPlatform: 'Windows', coarsePointer: true }))).toBe(false)
    expect(isHandheld(device({ uaMobile: true, uaPlatform: 'Android', coarsePointer: false }))).toBe(true)
  })

  it('counts an Android tablet as handheld although it reports mobile: false', () => {
    expect(isHandheld(device({ uaMobile: false, uaPlatform: 'Android' }))).toBe(true)
  })

  it('counts Chrome desktop mode on an Android tablet as handheld only by its touch screen', () => {
    // Desktop mode reports Linux; a Linux laptop with a touchpad must still download.
    expect(isHandheld(device({ uaMobile: false, uaPlatform: 'Linux', coarsePointer: true }))).toBe(true)
    expect(isHandheld(device({ uaMobile: false, uaPlatform: 'Linux', coarsePointer: false }))).toBe(false)
  })

  it('recognises iOS, including iPadOS behind its desktop-mode Mac UA', () => {
    expect(isHandheld(device({ userAgent: IPHONE_UA }))).toBe(true)
    expect(isHandheld(device({ userAgent: MAC_UA, maxTouchPoints: 5 }))).toBe(true)
    expect(isHandheld(device({ userAgent: MAC_UA, maxTouchPoints: 0 }))).toBe(false)
    expect(isHandheld(device({ userAgent: MAC_UA, maxTouchPoints: 1 }))).toBe(false)
  })

  it('falls back to the coarse pointer only when no platform signal decides', () => {
    expect(isHandheld(device({ coarsePointer: true }))).toBe(true)
    expect(isHandheld(device({ coarsePointer: false }))).toBe(false)
  })
})

describe('prefersShareSheet', () => {
  const phone = device({ uaMobile: true })
  const desktop = device({ uaMobile: false })

  it('never offers the share sheet when the browser cannot share files', () => {
    expect(prefersShareSheet('save', false, phone)).toBe(false)
    expect(prefersShareSheet('share', false, desktop)).toBe(false)
  })

  it('sends Save to the share sheet on handhelds only, Share everywhere', () => {
    expect(prefersShareSheet('save', true, phone)).toBe(true)
    expect(prefersShareSheet('save', true, desktop)).toBe(false)
    expect(prefersShareSheet('share', true, desktop)).toBe(true)
  })
})

describe('exportScale', () => {
  it('picks the smallest integer scale that reaches a 1024 px long edge', () => {
    // Sides up to the largest real grid; 307 is where rounding instead of ceiling falls short.
    for (const side of [1, 32, 61, 300, 307, 384, 512]) {
      const scale = exportScale(side, 1)
      expect(Number.isInteger(scale)).toBe(true)
      expect(side * scale).toBeGreaterThanOrEqual(1024)
      expect(side * (scale - 1)).toBeLessThan(1024)
    }
    // The long edge decides, whichever axis it's on.
    expect(exportScale(41, 61)).toBe(exportScale(61, 41))
  })
})

describe('export filenames', () => {
  it('folds accents and collapses punctuation and spaces', () => {
    expect(exportSlug('Zoë  O\'Brien!')).toBe('zoe-o-brien')
  })

  it('folds Latin letters that have no accent to strip', () => {
    expect(exportSlug('Søren Straße')).toBe('soren-strasse')
    expect(exportSlug('Łukasz Þór Æsa')).toBe('lukasz-thor-aesa')
    expect(exportSlug('Ðorđe Bəxtiyar')).toBe('dorde-bextiyar')
    expect(exportSlug('col·legi')).toBe('collegi')
  })

  it('cuts long names at 40 characters without leaving a trailing hyphen', () => {
    expect(exportSlug(`${'a'.repeat(39)} b`)).toBe('a'.repeat(39))
  })

  it('names a RESULTS drawing by room and player, falling back for emoji-only names', () => {
    expect(drawingFilename('feral-crayon', 'Big Al')).toBe('pixmaler-feral-crayon-big-al.png')
    expect(drawingFilename('feral-crayon', '🎨🎭')).toBe('pixmaler-feral-crayon-drawing.png')
  })

  it('names a Paint drawing by sample id, else the upload without its extension', () => {
    expect(paintFilename({ sample: 'great-wave', source: 'The Great Wave off Kanagawa' })).toBe('pixmaler-paint-great-wave.png')
    expect(paintFilename({ sample: null, source: 'IMG_2041.HEIC' })).toBe('pixmaler-paint-img-2041.png')
    expect(paintFilename({ sample: null, source: 'holiday.2024.final.jpeg' })).toBe('pixmaler-paint-holiday-2024-final.png')
  })

  it('keeps dots that are part of a title, not an image extension', () => {
    // Free mode progress saved before sample ids existed restore with only the title.
    expect(paintFilename({ sample: null, source: 'Malta. Presa dal Levante' })).toBe('pixmaler-paint-malta-presa-dal-levante.png')
    expect(paintFilename({ sample: null, source: 'Dr. Who' })).toBe('pixmaler-paint-dr-who.png')
  })

  it('falls back to "drawing" when there is no source at all', () => {
    expect(paintFilename(null)).toBe('pixmaler-paint-drawing.png')
  })

  it('marks the share card apart from the plain drawing', () => {
    expect(drawingFilename('feral-crayon', 'Big Al', 'card')).toBe('pixmaler-feral-crayon-big-al-card.png')
    expect(paintFilename({ sample: 'great-wave', source: 'The Great Wave off Kanagawa' }, 'card')).toBe('pixmaler-paint-great-wave-card.png')
  })
})

describe('cardLayout', () => {
  const LONG_EDGE = 1600
  // Real grid shapes: the 3:2 / 1:1 / 2:3 ratios at small, typical and the largest detail.
  const GRIDS: Array<[number, number]> = [[61, 41], [41, 61], [32, 32], [12, 8], [384, 256], [256, 384], [300, 300], [512, 512], [512, 341], [341, 512]]

  function panelsOverlap(l: CardLayout): boolean {
    const a = l.target
    const b = l.drawing
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  }

  it('stacks landscape grids and sets square and portrait ones side by side, target first', () => {
    const landscape = cardLayout(61, 41)
    expect(landscape.stacked).toBe(true)
    expect(landscape.drawing.x).toBe(landscape.target.x)
    expect(landscape.drawing.y).toBeGreaterThan(landscape.target.y + landscape.target.h)
    for (const [w, h] of [[41, 61], [32, 32]]) {
      const l = cardLayout(w, h)
      expect(l.stacked).toBe(false)
      expect(l.drawing.y).toBe(l.target.y)
      expect(l.drawing.x).toBeGreaterThan(l.target.x + l.target.w)
    }
  })

  it('uses the largest integer panel scale that keeps the long edge within 1600 px', () => {
    for (const [w, h] of GRIDS) {
      const l = cardLayout(w, h)
      expect(Number.isInteger(l.scale)).toBe(true)
      expect(Math.max(l.width, l.height)).toBeLessThanOrEqual(LONG_EDGE)
      // One more pixel per cell grows each panel by a cell's worth and must overflow.
      const grownW = l.width + (l.stacked ? w : 2 * w)
      const grownH = l.height + (l.stacked ? 2 * h : h)
      expect(Math.max(grownW, grownH)).toBeGreaterThan(LONG_EDGE)
      expect([l.target.w, l.target.h]).toEqual([w * l.scale, h * l.scale])
    }
  })

  it('keeps both panels inside the card, clear of each other and of the header and footer', () => {
    for (const [w, h] of GRIDS) {
      const l = cardLayout(w, h)
      expect(panelsOverlap(l)).toBe(false)
      for (const p of [l.target, l.drawing]) {
        expect(p.y).toBeGreaterThanOrEqual(l.header.y + l.header.h)
        expect(p.y + p.h).toBeLessThanOrEqual(l.footer.y)
        expect(p.x + p.w).toBeLessThanOrEqual(l.width)
      }
      expect(l.footer.y + l.footer.h).toBeLessThanOrEqual(l.height)
      expect(l.chip.y).toBeGreaterThanOrEqual(l.footer.y)
      expect(l.chip.y + l.chip.h).toBeLessThanOrEqual(l.footer.y + l.footer.h)
    }
  })

  it('fits the largest grid the wire allows at one pixel per cell', () => {
    expect(cardLayout(GRID_MAX_SIDE, GRID_MAX_SIDE).scale).toBe(1)
  })
})
