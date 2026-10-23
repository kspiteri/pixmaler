// Drawing export — the decisions a player sees: whether Save opens the share sheet or downloads,
// how big the PNG comes out, and what the file is called.

import type { DeviceSignals } from '../src/lib/export/deliver'
import { describe, expect, it } from 'vitest'
import { isHandheld, prefersShareSheet } from '../src/lib/export/deliver'
import { drawingFilename, exportSlug, paintFilename } from '../src/lib/export/filename'
import { exportScale } from '../src/lib/export/png'

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

  it('recognises iOS, including iPadOS behind its desktop-mode Mac UA', () => {
    expect(isHandheld(device({ userAgent: IPHONE_UA }))).toBe(true)
    expect(isHandheld(device({ userAgent: MAC_UA, maxTouchPoints: 5 }))).toBe(true)
    expect(isHandheld(device({ userAgent: MAC_UA, maxTouchPoints: 0 }))).toBe(false)
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
    // Paint sessions saved before sample ids existed restore with only the title.
    expect(paintFilename({ sample: null, source: 'Malta. Presa dal Levante' })).toBe('pixmaler-paint-malta-presa-dal-levante.png')
    expect(paintFilename({ sample: null, source: 'Dr. Who' })).toBe('pixmaler-paint-dr-who.png')
  })

  it('falls back to "drawing" when there is no source at all', () => {
    expect(paintFilename(null)).toBe('pixmaler-paint-drawing.png')
  })
})
