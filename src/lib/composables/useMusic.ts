import type { Ref, ShallowRef } from 'vue'
import type { MusicTrackId, StateMsg } from '../protocol/types'
import { watch } from 'vue'
import { currentTrack, playMusic, stopMusic } from '../audio'
import { MUSIC_TRACKS } from '../content/music'
import { musicPlan } from '../musicPlan'
import { normaliseMusicTrack } from '../protocol/types'
import { serverTime } from '../serverClock'

// Phase-driven background music: fades in when DRAWING begins, carries through VOTING and
// RESULTS, fades out on return to LOBBY (or Play again). The track is the GM's
// `config.musicTrack` (null = none). On start it seeks to the position the whole room is at
// (musicPlan, loop fit), so a late joiner or a reloaded tab lands in sync, not back at 0:00.
// Gating on the `music` toggle lives in the audio module. App calls this once on the room route.
export function useMusic(state: ShallowRef<StateMsg | null>, closed: Ref<boolean>): void {
  // Where in the track the room is now, so a client starting late lands in sync. Only meaningful
  // during DRAWING, where the deadline describes this round; elsewhere start from the top.
  function startOffsetS(track: MusicTrackId): number {
    const s = state.value
    if (!s || s.phase !== 'DRAWING' || s.deadline === null)
      return 0
    const durationS = MUSIC_TRACKS.find(t => t.id === track)?.durationS ?? 0
    const plan = musicPlan({ fit: 'loop', durationS, roundSeconds: s.roundSeconds, deadline: s.deadline, now: serverTime() })
    return plan.action === 'play' ? plan.offsetS : 0
  }

  watch(() => state.value?.phase ?? null, (phase) => {
    if (!phase || phase === 'LOBBY') {
      stopMusic()
      return
    }
    // Start the round's track — also for a client that lands mid-round in VOTING/RESULTS — but
    // skip if it's already playing, so the track carries across phases instead of restarting.
    const track = normaliseMusicTrack(state.value?.config?.musicTrack)
    if (track && currentTrack.value !== track)
      playMusic(track, { offsetS: startOffsetS(track) })
  })
  // A session can end in RESULTS, on a screen with no widget or menu to mute it — so stop here.
  watch(closed, (isClosed) => {
    if (isClosed)
      stopMusic()
  })
}
