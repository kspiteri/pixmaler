// The GM's confirm-and-send room actions, shared by the phase views so the confirmation
// copy and message types live in one place. `stopVoting` skips its confirm once everyone
// has voted — the caller passes that, since only it knows the tally.

import type PartySocket from 'partysocket'
import type { ClientMsg } from '../protocol/types'
import { askConfirm } from '../dialog'

export function useGmActions(socket: PartySocket) {
  function send(msg: ClientMsg) {
    socket.send(JSON.stringify(msg))
  }

  async function cancelRound() {
    if (!await askConfirm('Cancel this round? Everyone goes back to the lobby and the drawings are lost.', { confirm: 'Cancel round', cancel: 'Keep playing' }))
      return
    send({ type: 'gm:cancelRound' })
  }

  async function endSession() {
    if (!await askConfirm('End the session for everyone? The room closes and this code is released.', { confirm: 'End session', cancel: 'Keep the room' }))
      return
    send({ type: 'gm:endSession' })
  }

  function playAgain() {
    send({ type: 'gm:playAgain' })
  }

  async function stopVoting(everyoneVoted: boolean) {
    if (!everyoneVoted && !await askConfirm('End voting now? Anyone who hasn\'t finished voting won\'t be counted.', { confirm: 'End voting', cancel: 'Keep voting' }))
      return
    send({ type: 'gm:stopVoting' })
  }

  return { cancelRound, endSession, playAgain, stopVoting }
}
