import type { Ref, ShallowRef } from 'vue'
import type { StateMsg } from '../protocol/types'
import { onBeforeUnmount, watch } from 'vue'
import { currentTrack, playAmbient, playMusic, stopAmbient, stopMusic } from '../audio'
import { MUSIC_TRACKS } from '../content/music'
import { musicPlan } from '../musicPlan'
import { normaliseMusicFit, normaliseMusicTrack } from '../protocol/types'
import { serverTime } from '../serverClock'

// Phase-driven background music. The chosen track plays during DRAWING, fitted to the round by
// `config.musicFit` (default finale: the song ends on the deadline, so the music is the
// countdown). A short ambient loop fills any gap the song leaves — the finale lead-in, an
// extension tail, and the VOTING/RESULTS gallery. Everything is re-derived from the pure plan
// (musicPlan) on each state push, visibility change and extension, so a late joiner, a +15s and a
// backgrounded tab all converge. App calls this once on the room route.
export function useMusic(state: ShallowRef<StateMsg | null>, closed: Ref<boolean>): void {
  // Pending finale start during a lead-in gap.
  let startTimer: number | null = null

  function clearStartTimer(): void {
    if (startTimer !== null) {
      clearTimeout(startTimer)
      startTimer = null
    }
  }

  // A finale that ends before the deadline (an extension left a tail) hands off to the ambient bed.
  // The ended howl is left in place so replan won't restart it; the next phase clears it.
  function onFinaleEnd(): void {
    if (state.value?.phase === 'DRAWING')
      playAmbient()
  }

  function replan(): void {
    clearStartTimer()
    // A closed session can still hold a non-LOBBY phase; a visibilitychange replan would then
    // restart music on the terminal screen, which has no widget to stop it.
    if (closed.value) {
      stopMusic()
      stopAmbient()
      return
    }
    const s = state.value
    const phase = s?.phase ?? null

    if (!phase || phase === 'LOBBY') {
      stopMusic()
      stopAmbient()
      return
    }

    const track = normaliseMusicTrack(s!.config?.musicTrack)
    if (!track) {
      // The GM chose no music: silence, not the ambient bed.
      stopMusic()
      stopAmbient()
      return
    }

    // Only DRAWING runs the song against its deadline. By VOTING/RESULTS the finale is over, so
    // the ambient bed becomes the gallery music.
    if (phase !== 'DRAWING' || s!.deadline === null) {
      stopMusic()
      playAmbient()
      return
    }

    const fit = normaliseMusicFit(s!.config?.musicFit)
    const plan = musicPlan({
      fit,
      durationS: MUSIC_TRACKS.find(t => t.id === track)?.durationS ?? 0,
      roundSeconds: s!.roundSeconds,
      deadline: s!.deadline,
      now: serverTime(),
    })

    if (plan.action === 'wait') {
      // Already playing (an extension pushed songStart past now): leave it — never seek a playing
      // song backward, and don't bring the ambient bed up under it.
      if (currentTrack.value === track)
        return
      // Finale lead-in: ambient now, song when the timer fires (a later re-plan starts it).
      playAmbient()
      startTimer = window.setTimeout(replan, plan.startInMs)
      return
    }
    if (plan.action === 'silent') {
      // The song has finished. Ambient covers the tail, unless the GM asked for `once` (= silence).
      stopMusic()
      if (fit === 'once')
        stopAmbient()
      else
        playAmbient()
      return
    }
    // play: start at the synced offset and crossfade the ambient out. If it's already this track,
    // leave it — never seek a playing song backward, which is the +15s "no seek-back" rule, and
    // also what stops an ended finale from being restarted mid-tail.
    if (currentTrack.value !== track) {
      playMusic(track, {
        offsetS: plan.offsetS,
        loop: plan.loop,
        onEnd: fit === 'finale' ? onFinaleEnd : undefined,
      })
      stopAmbient()
    }
  }

  watch(() => state.value?.phase ?? null, replan)
  watch(() => state.value?.deadline ?? null, replan)
  watch(closed, (isClosed) => {
    if (isClosed) {
      clearStartTimer()
      stopMusic()
      stopAmbient()
    }
  })

  // Background tabs throttle timers, so the lead-in timer and the clock can drift; re-plan on the
  // way back to resync.
  function onVisible(): void {
    if (document.visibilityState === 'visible')
      replan()
  }
  document.addEventListener('visibilitychange', onVisible)
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisible)
    clearStartTimer()
  })
}
