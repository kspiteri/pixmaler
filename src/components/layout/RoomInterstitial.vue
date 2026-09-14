<script setup lang="ts">
// The shared shell for every "you are not in a game" room screen: the name gate before
// joining, and the three terminal refusals (room full, no such room, wiped). It renders the
// wordmark, an eyebrow, and the room code off the URL, then a slot for the screen's own body
// — a note plus an action, or the name form.
//
// The interstitial *shape* also lives as a mixin (`_screen.scss`) because `PhaseBoundary`
// renders it as an error boundary that must mount no components; this component is for the
// screens that can. `code` is exposed to the slot so a body that needs it (SessionClosed's
// reopen) reads the URL once, here.

import Logo from '@/components/elements/Logo.vue'

defineProps<{ eyebrow: string }>()

const roomCode = new URLSearchParams(location.search).get('room') ?? ''
</script>

<template>
  <div class="page page--narrow room-screen">
    <Logo />
    <p class="label label--eyebrow">
      {{ eyebrow }}
    </p>
    <p class="room-screen__code">
      {{ roomCode }}
    </p>
    <slot :code="roomCode" />
  </div>
</template>
