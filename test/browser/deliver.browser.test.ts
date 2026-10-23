// Delivery fallbacks — what a press of Save does when the share sheet fails. A dismissed sheet is
// the player's choice and must download nothing; any other failure must still hand over the file.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { deliverFile } from '@/lib'

const blob = new Blob(['x'], { type: 'image/png' })

function stubShare(err: DOMException) {
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
  Object.defineProperty(navigator, 'share', { configurable: true, value: () => Promise.reject(err) })
  return vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
}

afterEach(() => {
  vi.restoreAllMocks()
  delete (navigator as Partial<Navigator>).canShare
  delete (navigator as Partial<Navigator>).share
})

describe('deliverFile', () => {
  it('treats a dismissed share sheet as cancelled and downloads nothing', async () => {
    const click = stubShare(new DOMException('dismissed', 'AbortError'))
    expect(await deliverFile(blob, 'a.png', 'share')).toBe('cancelled')
    expect(click).not.toHaveBeenCalled()
  })

  it('falls back to a download when sharing fails for any other reason', async () => {
    const click = stubShare(new DOMException('no activation', 'NotAllowedError'))
    expect(await deliverFile(blob, 'a.png', 'share')).toBe('downloaded')
    expect(click).toHaveBeenCalledOnce()
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('a.png')
  })
})
