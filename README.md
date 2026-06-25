# pixmaler

A real-time pixel-art party game.

> **Gameplay loop complete.** Lobby → Drawing → Voting → Results → Play again all work end-to-end. What's left is the responsive/mobile pass, reconnection edge cases, and CI/deploy wiring (GitHub Pages Action + `partykit deploy`).

## What it does

A game master uploads any image. It's quantized in the browser into chunky, limited-palette pixel art — that's the **target**. Everyone in the room then races a countdown to redraw the target by hand on a matching pixel canvas, using only the swatch of allowed colours. No eraser: you paint over your mistakes. When the timer runs out, every drawing is shown side-by-side and **anonymous**, and the room votes in two categories — 😂 **funniest** and ⭐ **best**. Then the chaotic reveal: an **overall winner** (most votes across both categories), with everyone else ranked behind in a gallery.

- **Memorable room codes** — join a game with a word-pair eg: `feral-crayon`
- **Server-authoritative** — phase, timer, submissions, and vote tallying all live on the server. No Cheating!
- **Blind reveal** — nobody sees anyone else's drawing until voting; you only see a live "X of Y finished" tally during the round.
- **Reconnect-safe** — drop and rejoin with the same identity; your slot (and your vote) survive. The original GM reclaims their role on re-connect; if absent, the longest-present player is auto-promoted. The GM can also explicitly transfer the role.
- **Cross-canvas hover marker** — hovering your canvas lights up a marker on the reference and highlights the matching swatch, so you don't have to squint at six near-identical browns.
- **Solo paint sandbox** — the [`/paint`](#paint-sandbox) route opens a single-player canvas with the same pipeline; useful for testing brushes and palettes, or just goofing around.

## Stack

- Vite + Vue 3 (Composition API, `<script setup>`) + TypeScript, canvas-based drawing
- [PartyKit](https://www.partykit.io/) on Cloudflare Durable Objects for realtime rooms
- `partysocket` WebSocket client (auto-reconnect)
- `unique-names-generator` for memorable room codes (custom curated word list)
- Client-side image pipeline: median-cut palette derivation + near-duplicate merge, then [pixelit](https://github.com/giventofly/pixelit) (vendored, MIT) for the pixelation pass. No server image processing, no image storage.

## Setup

```bash
pnpm install
pnpm dev               # Vite frontend
pnpm exec partykit dev  # realtime server on :1999 (separate terminal)
```

Set `VITE_PARTYKIT_HOST` (`127.0.0.1:1999` in dev). See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full developer guide — tooling, conventions, and deploy.

## Paint sandbox

`/pixmaler/paint` opens a solo canvas — pick a sample (Mona Lisa / The Scream / Pearl Earring) or upload your own image, tweak the scale and colour count, then paint. No lobby, no timer, no socket. Linked from the entry screen.
