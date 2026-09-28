import type { Ref, ShallowRef } from 'vue'
import type { StateMsg } from '../protocol/types'
import { watch } from 'vue'
import { currentTrack, playMusic, stopMusic } from '../audio'
import { normaliseMusicTrack } from '../protocol/types'

// Phase-driven background music: fades in when DRAWING begins, carries through VOTING and
// RESULTS, fades out on return to LOBBY (or Play again). The track is the GM's
// `config.musicTrack` (null = none). Gating on the `music` toggle lives in the audio module.
// App calls this once on the room route.
export function useMusic(state: ShallowRef<StateMsg | null>, closed: Ref<boolean>): void {
  watch(() => state.value?.phase ?? null, (phase) => {
    if (!phase || phase === 'LOBBY') {
      stopMusic()
      return
    }
    // Start the round's track — also for a client that lands mid-round in VOTING/RESULTS — but
    // skip if it's already playing, so the track carries across phases instead of restarting.
    const track = normaliseMusicTrack(state.value?.config?.musicTrack)
    if (track && currentTrack.value !== track)
      playMusic(track)
  })
  // A session can end in RESULTS, on a screen with no widget or menu to mute it — so stop here.
  watch(closed, (isClosed) => {
    if (isClosed)
      stopMusic()
  })
}
