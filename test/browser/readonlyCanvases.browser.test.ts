// B4 — useReadonlyCanvases :ref timing: the two-tick wait that lets Vue's function-form
// `:ref` callbacks run before the composable mounts canvases into them, plus the
// group-priority rule when one key lives in two groups. Both need a real mount and DOM patch.

import type { ReadonlyThumb } from '@/lib'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { useReadonlyCanvases } from '@/lib'

const unmounts: Array<() => void> = []

const palette = ['#101010', '#ff0000', '#00ff00']

// A slot (group, key) rendered as a `:ref` div, exactly as the galleries wire them.
interface SlotSpec { group: string, key: string }

function thumb(groups: string[], key: string): ReadonlyThumb {
  return { groups, key, gridW: 3, gridH: 3, palette, grid: Array.from({ length: 9 }).fill(1) as number[] }
}

function mountGallery(slotSpecs: SlotSpec[], thumbs: ReadonlyThumb[]) {
  const app = createApp(defineComponent({
    setup() {
      const { setSlot } = useReadonlyCanvases(() => thumbs, () => thumbs)
      return () => h('div', slotSpecs.map(s => h('div', {
        'data-slot': `${s.group}/${s.key}`,
        'ref': (el: unknown) => setSlot(s.group, s.key, el),
      })))
    },
  }))
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  unmounts.push(() => app.unmount())
}

// Wait past the composable's two-tick guard (plus margin) so mounting has run.
async function settle() {
  for (let i = 0; i < 4; i++)
    await nextTick()
}

function slot(group: string, key: string): HTMLElement {
  return document.querySelector(`[data-slot="${group}/${key}"]`)!
}

function hasPaintedCanvas(el: HTMLElement): boolean {
  const canvas = el.querySelector('canvas')
  if (!canvas)
    return false
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0)
      return true
  }
  return false
}

afterEach(() => {
  unmounts.splice(0).forEach(unmount => unmount())
  document.body.replaceChildren()
})

describe('useReadonlyCanvases :ref timing (browser)', () => {
  it('every slot receives its mounted, painted canvas once settled', async () => {
    mountGallery(
      [{ group: 'gallery', key: 'a' }, { group: 'gallery', key: 'b' }],
      [thumb(['gallery'], 'a'), thumb(['gallery'], 'b')],
    )
    await settle()
    expect(hasPaintedCanvas(slot('gallery', 'a'))).toBe(true)
    expect(hasPaintedCanvas(slot('gallery', 'b'))).toBe(true)
  })

  it('a key in two groups mounts into the first group only', async () => {
    mountGallery(
      [{ group: 'hero', key: 'win' }, { group: 'gallery', key: 'win' }, { group: 'gallery', key: 'other' }],
      [thumb(['hero', 'gallery'], 'win'), thumb(['gallery'], 'other')],
    )
    await settle()
    expect(slot('hero', 'win').querySelector('canvas')).not.toBeNull()
    expect(slot('gallery', 'win').querySelector('canvas')).toBeNull()
    expect(slot('gallery', 'other').querySelector('canvas')).not.toBeNull()
  })
})
