// The server-message reducer: fold one parsed `ServerMsg` into the reactive room state.
// Split out of the composable because this switch is where the protocol grows — a new
// server message is a new case here, not a change to the socket wiring.

import type PartySocket from 'partysocket'
import type { Ref, ShallowRef } from 'vue'
import type { ServerMsg } from '../../protocol/types'
import { askAlert } from '../../dialog'

// `shallowRef` throughout: the whole object is replaced on each message, so no deep-watch.
export type StateMsg = Extract<ServerMsg, { type: 'state' }>
export type GalleryMsg = Extract<ServerMsg, { type: 'gallery' }>
export type ResultsMsg = Extract<ServerMsg, { type: 'results' }>
export type VoteStateMsg = Extract<ServerMsg, { type: 'vote-state' }>
export type DrawStateMsg = Extract<ServerMsg, { type: 'draw-state' }>

// The reactive surface a server message can write. Everything else useRoom holds
// (connection status, the socket, the name gate, the duplicate-tab flag) is driven by the
// socket lifecycle or the pre-connect gate, never by an inbound message.
export interface RoomRefs {
  state: ShallowRef<StateMsg | null>
  gallery: ShallowRef<GalleryMsg | null>
  results: ShallowRef<ResultsMsg | null>
  voteState: ShallowRef<VoteStateMsg | null>
  drawState: ShallowRef<DrawStateMsg | null>
  targetGrid: ShallowRef<number[] | null>
  sessionClosed: Ref<boolean>
  roomFull: Ref<boolean>
  noSuchRoom: Ref<boolean>
  roundCancelled: Ref<boolean>
  // Create intent is spent on the first accepted join (the first `state`); a later reconnect
  // must be a plain join, else a reconnect after an empty-room wipe would silently re-create
  // the room with this client as GM instead of showing the 404 (#66).
  joinCreate: Ref<boolean>
}

// `socket` is needed only for the terminal messages, where the flag is set *before* the close
// so the `close` handler knows the teardown was deliberate (and doesn't auto-reconnect us into
// a pristine room as a new GM).
export function applyServerMessage(msg: ServerMsg, refs: RoomRefs, socket: PartySocket): void {
  switch (msg.type) {
    case 'state':
      refs.state.value = msg
      refs.joinCreate.value = false // accepted — never re-create on a later reconnect (#66)
      // `config: null` is the room leaving a round behind, so the grid goes with it.
      if (!msg.config)
        refs.targetGrid.value = null
      break
    case 'target': refs.targetGrid.value = msg.grid; break
    case 'phase':
      // `phase` doesn't carry config/players — patch the cached state.
      if (refs.state.value)
        refs.state.value = { ...refs.state.value, phase: msg.phase, deadline: msg.deadline }
      // A `phase` message with DRAWING is only broadcast by handleStart — a fresh round the
      // server has cleared — so drop everything held from the previous round or Play again
      // resurrects it. A mid-round rejoin arrives as `state`, so restores survive. Nothing
      // else ever clears the last four:
      //   drawState — else the last drawing reappears on the new canvas
      //   results   — else RESULTS flashes the previous winner before the reveal
      //   gallery   — else a stale gallery is voted on
      //   voteState — else round 1's picks pre-fill round 2's vote UI
      if (msg.phase === 'DRAWING') {
        refs.roundCancelled.value = false
        refs.drawState.value = null
        refs.results.value = null
        refs.gallery.value = null
        refs.voteState.value = null
      }
      break
    case 'gallery': refs.gallery.value = msg; break
    case 'vote-state': refs.voteState.value = msg; break
    case 'draw-state': refs.drawState.value = msg; break
    case 'round-cancelled': refs.roundCancelled.value = true; break
    case 'session-closed':
      // Order matters: set the flag before closing so the `close` handler knows this teardown
      // was deliberate. Closing stops auto-reconnect, which would otherwise re-join us to a
      // pristine room as a new player and silently make us its GM.
      refs.sessionClosed.value = true
      socket.close()
      break
    case 'room-full':
      // Same teardown order as `session-closed`: flag before close, so the `close` handler
      // treats it as deliberate and doesn't show "Reconnecting…".
      refs.roomFull.value = true
      socket.close()
      break
    case 'no-such-room':
      // Same teardown order as `room-full`: flag before close. The pre-flight usually catches
      // this first; this is the backstop for a client that connected anyway (create intent, or
      // a probe that failed open).
      refs.noSuchRoom.value = true
      socket.close()
      break
    case 'results': refs.results.value = msg; break
    case 'done-status':
      if (refs.state.value) {
        refs.state.value = {
          ...refs.state.value,
          doneCount: msg.doneCount,
          totalDrawing: msg.totalDrawing,
        }
      }
      break
    case 'error':
      // A backstop, not a workflow: the UI already prevents every rejection the server can
      // send, so this catches races and protocol drift.
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
}
