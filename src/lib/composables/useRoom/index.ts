// The room connection and server-message dispatch, lifted out of `App.vue`. Owns the socket
// lifecycle, the reactive room state the phase views render, and the `provide`d infrastructure
// (`socket`, `clientId`). App calls it once with the room code (null off the room route).
//
// A composable, not a module: it wires `provide`/`onMounted`, which must run synchronously
// during the owning component's setup. The message reducer lives in `./messages`, the
// Vue-free pre-connect helpers (existence probe + single-tab lock) in `./gate`.

import type { ClientMsg, ServerMsg } from '../../protocol/types'
import type { DrawStateMsg, GalleryMsg, ResultsMsg, RoomRefs, StateMsg, VoteStateMsg } from './messages'
import PartySocket from 'partysocket'
import { computed, onMounted, provide, ref, shallowRef } from 'vue'
import { clientIdKey, socketKey } from '../../keys'
import { getClientId, getName, getSecret, getShape, setName, setSecret } from '../../player/identity'
import { acquireRoomTab, roomExists } from './gate'
import { applyServerMessage } from './messages'

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST ?? '127.0.0.1:1999'
// The kebab-cased Durable Object binding name (PixmalerServer → "pixmaler-server"); the socket
// and the existence probe both address the room through it.
const PARTY_NAME = 'pixmaler-server'

// `roomCode` is null off the room route (App resolves /paint and /taglines first), which is
// why the connect/provide side-effects are guarded on it.
export function useRoom(roomCode: string | null, createIntent = false) {
  // ── The reactive surface a server message writes (see `RoomRefs`) ──
  const state = shallowRef<StateMsg | null>(null)
  const gallery = shallowRef<GalleryMsg | null>(null)
  const results = shallowRef<ResultsMsg | null>(null)
  // This voter's own picks, echoed by the server on (re)join during VOTING so the vote UI
  // rehydrates after a reconnect. Null until/unless we receive it.
  const voteState = shallowRef<VoteStateMsg | null>(null)
  // This player's own in-progress grid, echoed by the server on (re)join during DRAWING so a
  // page reload restores their drawing. Null until/unless received.
  const drawState = shallowRef<DrawStateMsg | null>(null)
  // The image players are copying, held across updates because `state` no longer carries it.
  // Arrives on configure and on join; cleared when `config` goes null.
  const targetGrid = shallowRef<number[] | null>(null)
  // Terminal: the server wiped the room (idle timeout), so this client's slot is gone and
  // reconnecting can't recover it. Stop trying and say so.
  const sessionClosed = ref(false)
  // Terminal: the room is at `MAX_PLAYERS`, so this client was refused a seat.
  const roomFull = ref(false)
  // Terminal: the room does not exist and we did not ask to create it (#66).
  const noSuchRoom = ref(false)
  // The GM abandoned the round in flight, so LOBBY owes everyone a reason: their canvas
  // emptied. Held here, not in `Lobby.vue`, because the message arrives while `Drawing.vue`
  // is still mounted. Cleared when the next round starts or the player dismisses it.
  const roundCancelled = ref(false)
  const joinCreate = ref(createIntent)

  const refs: RoomRefs = {
    state,
    gallery,
    results,
    voteState,
    drawState,
    targetGrid,
    sessionClosed,
    roomFull,
    noSuchRoom,
    roundCancelled,
    joinCreate,
  }

  // ── Driven by the socket lifecycle / the pre-connect gate, not by messages ──
  const connectionStatus = ref<'connecting' | 'connected' | 'reconnecting'>('connecting')
  // The same room is already open in another tab of this browser; this one takes over on close.
  const duplicateTab = ref(false)
  // Created lazily by `connect()` after the name gate, so starts null. Non-null by the time any
  // phase view mounts.
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
    const socket = new PartySocket({ host: PARTYKIT_HOST, party: PARTY_NAME, room: roomCode! })
    socketRef.value = socket

    socket.addEventListener('open', () => {
      connectionStatus.value = 'connected'
      // getSecret/getShape are read on every open, not captured, so a reconnect echoes the
      // secret the server issued after the first join — that is what reclaims the seat (#72).
      const msg: ClientMsg = { type: 'join', clientId: myClientId, name, shape: getShape(), create: joinCreate.value, secret: getSecret(roomCode!) ?? undefined }
      socket.send(JSON.stringify(msg))
    })

    socket.addEventListener('close', () => {
      // A close after a terminal message is our own deliberate teardown, not a blip — don't
      // contradict the terminal screen with a "Reconnecting…" banner.
      if (sessionClosed.value || roomFull.value || noSuchRoom.value)
        return
      // partysocket auto-reconnects, so a close is "reconnecting", not dead — the next `open`
      // re-sends `join` and reclaims the slot. Surface it rather than freeze silently.
      connectionStatus.value = 'reconnecting'
      console.warn('[pixmaler] socket closed — reconnecting')
    })

    socket.addEventListener('message', (ev) => {
      let msg: ServerMsg
      try { msg = JSON.parse(ev.data as string) as ServerMsg }
      catch { console.error('[pixmaler] bad message', ev.data); return }
      // The seat secret is identity, not reactive room state, so it is persisted here rather
      // than in the message reducer. Issued once, on the first join (#72).
      if (msg.type === 'session') {
        setSecret(roomCode!, msg.secret)
        return
      }
      applyServerMessage(msg, refs, socket)
    })
  }

  // The name gate's only output. `lib/identity` owns the `pixmaler:name` key; storing the
  // chosen name and opening the socket both stay here, so the gate touches neither.
  function submitName(chosen: string) {
    setName(chosen)
    showNameGate.value = false
    connect(chosen)
  }

  // Reuse a stored name, else show the name gate to collect one.
  function startGate() {
    const existing = getName()
    if (existing)
      connect(existing)
    else
      showNameGate.value = true
  }

  // Create intent connects straight off; a plain join pre-flights the existence probe first,
  // so a dead code shows the 404 without opening a socket (#66).
  function runGate(code: string) {
    if (createIntent) {
      startGate()
    }
    else {
      roomExists(PARTYKIT_HOST, PARTY_NAME, code).then((exists) => {
        if (exists)
          startGate()
        else
          noSuchRoom.value = true
      })
    }
  }

  if (roomCode) {
    provide(clientIdKey, myClientId)
    provide(socketKey, socketRef)

    acquireRoomTab(roomCode, {
      onActive: () => { duplicateTab.value = false; runGate(roomCode) },
      onDuplicate: () => { duplicateTab.value = true },
    })

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
    roomFull,
    noSuchRoom,
    duplicateTab,
    roundCancelled,
    showNameGate,
    spectating,
    submitName,
  }
}
