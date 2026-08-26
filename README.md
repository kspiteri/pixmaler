# pixmaler

A real-time pixel-art party game.

> **Deployed and playable.** Lobby → Drawing → Voting → Results → Play again all work end-to-end, with a dark "party game" visual theme and two-category voting. The frontend is on GitHub Pages and the realtime server is live on Cloudflare Workers. A round of playtest hardening landed 2026-08-23 — GM round/session controls, unique player names, and proper resolutions for the rounds where nobody draws or nobody votes. What's left is a visual personality pass — currently under way — plus sound and a few deferred engineering pieces.

## What it does

A game master uploads any image. It's quantized in the browser into chunky, limited-palette pixel art — that's the **target**. Everyone in the room then races a countdown to redraw the target by hand on a matching pixel canvas, using only the swatch of allowed colours. No eraser: you paint over your mistakes. When the timer runs out, every drawing is shown side-by-side and **anonymous**, and the room votes in two categories — 😂 **funniest** and ⭐ **best**. Then the chaotic reveal: an **overall winner** (most votes across both categories), with everyone else ranked behind in a gallery.

- **Memorable room codes** — join a game with a word-pair eg: `feral-crayon`
- **Two-category voting** — vote 😂 funniest and ⭐ best on the anonymised, per-client-shuffled gallery; the GM watches a live "X of Y voted" tally and ends the round when ready. Results rank by overall points (chaotic — a drawing 2nd in everything can pip a category winner). A generous server-side deadline backstops the phase so an absent GM can't strand the room; it surfaces to players only in the final 30 seconds.
- **Server-authoritative** — phase, timer, submissions, and vote tallying all live on the server. No Cheating!
- **Blind reveal** — nobody sees anyone else's drawing until voting; during the round you only see a live "X of Y finished" tally, and vote *targets* stay hidden until the reveal.
- **Reconnect-safe** — drop and rejoin with the same identity; your slot (and your votes) survive. The original GM reclaims their role on re-connect; if absent, the longest-present player is auto-promoted. The GM can also explicitly transfer the role.
- **GM round and session controls** — cancel a round in flight and send everyone back to the lobby (for when the target renders broken), or end the session outright from the lobby or results, which closes the room for everyone and releases the code. Both confirm first.
- **No duplicate names** — names are unique per room, compared ignoring case and whitespace. A collision gets an adjective in front of it, in the same shape as the room code: a second `Keith` becomes `angry-Keith`. Your device keeps the plain name for the next room.
- **The original wins** — a round where nobody drew, or where nobody voted, doesn't fake a winner. The target image takes the hero card ("nobody drew — the original wins") and the whole field drops into the gallery. A round with no drawings skips voting entirely rather than parking everyone on an empty screen.
- **Cross-canvas hover marker** — hovering your canvas lights up a marker on the reference and highlights the matching swatch, so you don't have to squint at six near-identical browns.
- **Solo paint sandbox** — the [`/paint`](#paint-sandbox) route opens a single-player canvas with the same pipeline; useful for testing brushes and palettes, or just goofing around.

## Stack

- Vite + Vue 3 (Composition API, `<script setup>`) + TypeScript, canvas-based drawing
- [PartyServer](https://github.com/cloudflare/partyserver) on Cloudflare Durable Objects for realtime rooms, deployed with `wrangler`
- `partysocket` WebSocket client (auto-reconnect)
- `unique-names-generator` for memorable room codes and for de-duplicating player names, both from a custom curated word list
- Client-side image pipeline: one exact downscale to the grid, median-cut palette derivation + near-duplicate merge, then per-cell quantisation. No dependencies, no server image processing, no image storage.

## Setup

```bash
pnpm install
pnpm dev        # Vite frontend on :7965
pnpm wr:dev     # realtime server on :1999 (separate terminal)
```

Both are needed to play; the `/paint` sandbox needs only `pnpm dev`. Set `VITE_PARTYKIT_HOST` so the client can find the server — `127.0.0.1:1999` in dev (already in the gitignored `.env.local`). See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full developer guide — tooling, conventions, and deploy.

## Paint sandbox

`/pixmaler/paint` opens a solo canvas — pick a sample (Mona Lisa / The Scream / Pearl Earring) or upload your own image, tweak the scale and colour count, then paint. No lobby, no timer, no socket. Linked from the entry screen.
