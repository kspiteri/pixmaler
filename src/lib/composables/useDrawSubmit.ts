// The DRAWING submit + countdown engine: debounced auto-submit of the canvas as it's drawn,
// a final submit locked in at the deadline, and the rAF countdown. Restartable because the
// deadline can move (the GM's +15s arrives as a fresh state push), so the tick and the
// auto-submit always read the live deadline, never a mount-time value.

import type PartySocket from 'partysocket'
import type { Ref } from 'vue'
import type { ClientMsg } from '../protocol/types'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const RESUBMIT_DEBOUNCE_MS = 500

interface Options {
  socket: PartySocket
  deadline: () => number | null
  // The editable canvas, read at the deadline. Returns its grid via `getGrid()`.
  player: () => { getGrid: () => number[] } | null | undefined
  // Server-echoed grid on a mid-round rejoin, to prime the dedup so no redundant resubmit fires.
  restoredGrid: () => number[] | null
}

export function useDrawSubmit(opts: Options): {
  secondsLeft: Ref<number | null>
  canvasBlank: Ref<boolean>
  onCanvasUpdate: (grid: number[]) => void
} {
  const { socket, deadline, player, restoredGrid } = opts

  const secondsLeft = ref<number | null>(null)
  // Seeded true (a fresh round starts empty); a restored grid and every stroke correct it.
  const canvasBlank = ref(true)

  let autoSubmitTimer: ReturnType<typeof setTimeout> | null = null
  let resubmitTimer: ReturnType<typeof setTimeout> | null = null
  let rafId: number | null = null
  let latestGrid: number[] | null = null
  let lastSentGrid: number[] | null = null

  function gridsEqual(a: number[], b: number[]): boolean {
    if (a === b)
      return true
    if (a.length !== b.length)
      return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i])
        return false
    }
    return true
  }

  function sendSubmit(grid: number[]) {
    if (lastSentGrid && gridsEqual(grid, lastSentGrid))
      return
    // Snapshot the array — `latestGrid` may keep mutating as more strokes land.
    lastSentGrid = [...grid]
    socket.send(JSON.stringify({ type: 'draw:submit', grid } satisfies ClientMsg))
  }

  function onCanvasUpdate(grid: number[]) {
    latestGrid = grid
    canvasBlank.value = grid.every(cell => cell === -1)
    if (resubmitTimer)
      clearTimeout(resubmitTimer)
    resubmitTimer = setTimeout(() => {
      if (latestGrid)
        sendSubmit(latestGrid)
    }, RESUBMIT_DEBOUNCE_MS)
  }

  function autoSubmitAtDeadline() {
    const p = player()
    if (!p)
      return
    sendSubmit(latestGrid ?? p.getGrid())
  }

  function cancelTimers() {
    if (autoSubmitTimer) { clearTimeout(autoSubmitTimer); autoSubmitTimer = null }
    if (resubmitTimer) { clearTimeout(resubmitTimer); resubmitTimer = null }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
  }

  function armCountdown() {
    if (autoSubmitTimer) { clearTimeout(autoSubmitTimer); autoSubmitTimer = null }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }

    const dl = deadline()
    if (!dl)
      return

    // Tick until 0, reading the live deadline each frame so an extension lands next frame.
    const tick = () => {
      const now = deadline()
      if (!now)
        return
      const left = Math.max(0, Math.ceil((now - Date.now()) / 1000))
      secondsLeft.value = left
      if (left > 0)
        rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    autoSubmitTimer = setTimeout(autoSubmitAtDeadline, Math.max(0, dl - Date.now()))
  }

  watch(deadline, armCountdown)

  onMounted(() => {
    const restored = restoredGrid()
    if (restored)
      lastSentGrid = [...restored]
    armCountdown()
    socket.addEventListener('close', cancelTimers, { once: true })
  })

  onBeforeUnmount(() => {
    // `{ once: true }` only self-removes when it fires, and the socket outlives this scope,
    // so remove it explicitly or each round leaks a listener.
    socket.removeEventListener('close', cancelTimers)
    cancelTimers()
  })

  return { secondsLeft, canvasBlank, onCanvasUpdate }
}
