// Delivery fallbacks — what a press of Save does when the share sheet fails. A dismissed sheet is
// the player's choice and must download nothing; any other failure must still hand over the file.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { deliverFile } from '@/lib'

const blob = new Blob(['x'], { type: 'image/png' })
const realMatchMedia = window.matchMedia

function stubShare(share: (data: ShareData) => Promise<void>) {
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
  Object.defineProperty(navigator, 'share', { configurable: true, value: share })
  return vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
}

afterEach(() => {
  vi.restoreAllMocks()
  delete (navigator as Partial<Navigator>).canShare
  delete (navigator as Partial<Navigator>).share
  window.matchMedia = realMatchMedia
})

describe('deliverFile', () => {
  it('reports a completed share and downloads nothing on top of it', async () => {
    const click = stubShare(() => Promise.resolve())
    expect(await deliverFile(blob, 'a.png', 'share', 't')).toBe('shared')
    expect(click).not.toHaveBeenCalled()
  })

  it('treats a dismissed share sheet as cancelled and downloads nothing', async () => {
    const click = stubShare(() => Promise.reject(new DOMException('dismissed', 'AbortError')))
    expect(await deliverFile(blob, 'a.png', 'share', 't')).toBe('cancelled')
    expect(click).not.toHaveBeenCalled()
  })

  it('falls back to a download when sharing fails for any other reason', async () => {
    const click = stubShare(() => Promise.reject(new DOMException('no activation', 'NotAllowedError')))
    expect(await deliverFile(blob, 'a.png', 'share', 't')).toBe('downloaded')
    expect(click).toHaveBeenCalledOnce()
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('a.png')
  })

  it('hands the share sheet the file and the given title, nothing else', async () => {
    const share = vi.fn((_data: ShareData) => Promise.resolve())
    stubShare(share)
    await deliverFile(blob, 'a.png', 'share', 'My drawing on Pixmaler')
    const data = share.mock.calls[0][0]
    expect(Object.keys(data).sort()).toEqual(['files', 'title'])
    expect(data.title).toBe('My drawing on Pixmaler')
    expect([data.files![0].name, data.files![0].type]).toEqual(['a.png', 'image/png'])
  })

  it('treats a share sheet that is already open as cancelled and downloads nothing', async () => {
    const click = stubShare(() => Promise.reject(new DOMException('', 'InvalidStateError')))
    expect(await deliverFile(blob, 'a.png', 'share', 't')).toBe('cancelled')
    expect(click).not.toHaveBeenCalled()
  })

  it('downloads a Save on a desktop even where the browser could share', async () => {
    const share = vi.fn(() => Promise.resolve())
    const click = stubShare(share)
    // The headless runners report desktop UAs; only the pointer query needs pinning.
    window.matchMedia = (q: string) => ({ ...realMatchMedia.call(window, q), matches: false, media: q })
    expect(await deliverFile(blob, 'a.png', 'save', 't')).toBe('downloaded')
    expect(share).not.toHaveBeenCalled()
    expect(click).toHaveBeenCalledOnce()
  })
})
