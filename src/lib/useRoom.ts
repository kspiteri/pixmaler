// The room connection and server-message dispatch, lifted out of `App.vue`. Owns the
// socket lifecycle, the reactive room state the phase views render, and the `provide`d
// infrastructure (`socket`, `clientId`). App calls it once with the room code (null off
// the room route).
//
// A composable, not a module: it wires `provide`/`onMounted`, which must run synchronously
// during the owning component's setup.

import type { ClientMsg, ServerMsg } from './types'
import PartySocket from 'partysocket'
import { computed, onMounted, provide, ref, shallowRef } from 'vue'
import { askAlert } from './dialog'
import { getClientId, getName, getShape, setName } from './identity'
import { clientIdKey, socketKey } from './keys'

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST ?? '127.0.0.1:1999'

// `shallowRef`: the whole object is replaced on each server message, so no deep-watch.
type StateMsg = Extract<ServerMsg, { type: 'state' }>
type GalleryMsg = Extract<ServerMsg, { type: 'gallery' }>
type ResultsMsg = Extract<ServerMsg, { type: 'results' }>
type VoteStateMsg = Extract<ServerMsg, { type: 'vote-state' }>
type DrawStateMsg = Extract<ServerMsg, { type: 'draw-state' }>

// `roomCode` is null off the room route (App resolves /paint and /taglines first), which
// is why the connect/provide side-effects are guarded on it.
export function useRoom(roomCode: string | null) {
  const state = shallowRef<StateMsg | null>(null)
  const gallery = shallowRef<GalleryMsg | null>(null)
  const results = shallowRef<ResultsMsg | null>(null)
  // This voter's own picks, echoed by the server on (re)join during VOTING so the
  // vote UI rehydrates after a reconnect. Null until/unless we receive it.
  const voteState = shallowRef<VoteStateMsg | null>(null)
  // This player's own in-progress grid, echoed by the server on (re)join during
  // DRAWING so a page reload restores their drawing. Null until/unless received.
  const drawState = shallowRef<DrawStateMsg | null>(null)
  // The image players are copying, held across updates because `state` no longer carries
  // it. Arrives on configure and on join; cleared when `config` goes null.
  const targetGrid = shallowRef<number[] | null>(null)
  const connectionStatus = ref<'connecting' | 'connected' | 'reconnecting'>('connecting')
  // Terminal: the server wiped the room (idle timeout), so this client's slot is gone and
  // reconnecting can't recover it. Stop trying and say so.
  const sessionClosed = ref(false)
  // The GM abandoned the round in flight, so LOBBY owes everyone a reason: their canvas
  // emptied. Held here, not in `Lobby.vue`, because the message arrives while `Drawing.vue`
  // is still mounted. Cleared when the next round starts or the player dismisses it.
  const roundCancelled = ref(false)

  // Created lazily by `connect()` after the name gate, so starts null. Non-null by the time
  // any phase view mounts.
  const socketRef = shallowRef<PartySocket | null>(null)

  // Name gate: shown on the room route until the player has a stored name. The screen is
  // `views/rooms/NameGate.vue`; this flag is just which branch renders.
  const showNameGate = ref(false)

  // One identity for the whole composable. Minted only on the room route — off it there's
  // nothing to identify, so a mere visit never creates a device id.
  const myClientId = roomCode ? getClientId() : ''

  // Joined mid-round, so this client sits it out. Derived from `state` rather than tracked
  // separately, so there's no extra reset to forget.
  const spectating = computed(() =>
    state.value?.players.find(p => p.clientId === myClientId)?.spectating ?? false,
  )

  function connect(name: string) {
    const clientId = myClientId

    // `party` matches the kebab-cased Durable Object binding name
    // (PixmalerServer → "pixmaler-server"); routePartykitRequest routes on it.
    const socket = new PartySocket({ host: PARTYKIT_HOST, party: 'pixmaler-server', room: roomCode! })
    socketRef.value = socket

    socket.addEventListener('open', () => {
      connectionStatus.value = 'connected'
      const msg: ClientMsg = { type: 'join', clientId, name, shape: getShape() }
      socket.send(JSON.stringify(msg))
    })

    socket.addEventListener('close', () => {
      // A close after `session-closed` is our own deliberate teardown, not a blip —
      // don't contradict the closed screen with a "Reconnecting…" banner.
      if (sessionClosed.value)
        return
      // partysocket auto-reconnects, so a close is "reconnecting", not dead — the next
      // `open` re-sends `join` and reclaims the slot. Surface it rather than freeze silently.
      connectionStatus.value = 'reconnecting'
      console.warn('[pixmaler] socket closed — reconnecting')
    })

    socket.addEventListener('message', (ev) => {
      let msg: ServerMsg
      try { msg = JSON.parse(ev.data as string) as ServerMsg }
      catch { console.error('[pixmaler] bad message', ev.data); return }

      switch (msg.type) {
        case 'state':
          state.value = msg
          // `config: null` is the room leaving a round behind, so the grid goes with it.
          if (!msg.config)
            targetGrid.value = null
          break
        case 'target': targetGrid.value = msg.grid; break
        case 'phase':
          // `phase` doesn't carry config/players — patch the cached state.
          if (state.value) {
            state.value = { ...state.value, phase: msg.phase, deadline: msg.deadline }
          }
          // A `phase` message with DRAWING is only broadcast by handleStart — a fresh round
          // the server has cleared — so drop everything held from the previous round or Play
          // again resurrects it. A mid-round rejoin arrives as `state`, so restores survive.
          // Nothing else ever clears the last three:
          //   drawState — else the last drawing reappears on the new canvas
          //   results   — else RESULTS flashes the previous winner before the reveal
          //   gallery   — else a stale gallery is voted on
          //   voteState — else round 1's picks pre-fill round 2's vote UI
          if (msg.phase === 'DRAWING') {
            roundCancelled.value = false
            drawState.value = null
            results.value = null
            gallery.value = null
            voteState.value = null
          }
          break
        case 'gallery': gallery.value = msg; break
        case 'vote-state': voteState.value = msg; break
        case 'draw-state': drawState.value = msg; break
        case 'round-cancelled': roundCancelled.value = true; break
        case 'session-closed':
          // Order matters: set the flag before closing so the `close` handler knows this
          // teardown was deliberate. Closing stops auto-reconnect, which would otherwise
          // re-join us to a pristine room as a new player and silently make us its GM.
          sessionClosed.value = true
          socket.close()
          break
        case 'results': results.value = msg; break
        case 'done-status':
          if (state.value) {
            state.value = {
              ...state.value,
              doneCount: msg.doneCount,
              totalDrawing: msg.totalDrawing,
            }
          }
          break
        case 'error':
          // A backstop, not a workflow: the UI already prevents every rejection
          // the server can send, so this catches races and protocol drift.
          console.warn('[pixmaler] server error:', msg.message)
          askAlert(msg.message)
          break
        case 'version': {
          // Composed here rather than server-side so the wire keeps the raw fields.
          const el = document.querySelector('meta[name="pixmaler:server"]')
          el?.setAttribute('content', [msg.timestamp, msg.id, msg.tag].filter(Boolean).join(' · '))
          break
        }
      }
    })
  }

  // The name gate's only output. `lib/identity` owns the `pixmaler:name` key; storing the
  // chosen name and opening the socket both stay here, so the gate touches neither.
  function submitName(chosen: string) {
    setName(chosen)
    showNameGate.value = false
    connect(chosen)
  }

  if (roomCode) {
    provide(clientIdKey, myClientId)
    provide(socketKey, socketRef)

    const existing = getName()
    if (existing) {
      connect(existing)
    }
    else {
      showNameGate.value = true
    }

    onMounted(() => {
      document.title = `Pixmaler — ${roomCode}`
    })
  }

  return {
    state,
    gallery,
    results,
    voteState,
    drawState,
    targetGrid,
    connectionStatus,
    sessionClosed,
    roundCancelled,
    showNameGate,
    spectating,
    submitName,
  }
}
