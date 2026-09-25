import type { ShallowRef } from 'vue'
import type { StateMsg } from '../protocol/types'
import { watch } from 'vue'
import { playMusic, stopMusic } from '../audio'
import { trackSrc } from '../content/music'

// Phase-driven background music (#2): fades in when DRAWING begins, carries through VOTING and
// RESULTS, fades out on return to LOBBY (or Play again). The track is the GM's
// `config.musicTrack` (null = none). Gating on the `music` toggle lives in the audio module.
// App calls this once on the room route.
export function useMusic(state: ShallowRef<StateMsg | null>): void {
  watch(() => state.value?.phase ?? null, (phase, prev) => {
    if (phase === prev)
      return
    if (phase === 'DRAWING') {
      const track = state.value?.config?.musicTrack ?? null
      if (track)
        playMusic(trackSrc(track))
    }
    else if (phase === 'LOBBY') {
      stopMusic()
    }
  })
}
