# pixmaler

**A real-time pixel-art party game.** One image, a countdown, and a room full of people racing to redraw it.
Then voting on whose attempt was the best or just went gloriously wrong.

## → [Play it](https://kspiteri.github.io/pixmaler/)

Grab a code, share it with your friends or colleagues, and go. Three players needed for a game.

## How a round goes

1. **GM picks an image.** It's quantised in the browser into chunky, limited-palette pixel art; the **target**.
2. **Everyone races the clock.** Redraw the target by hand on a matching pixel canvas, using only the swatch of allowed colours.
3. **The room votes, blind.** When the timer runs out, every drawing goes up side-by-side and **anonymous**. Vote in two categories: **funniest** and **best**.
4. **The chaotic reveal.** Someone gets to win, or more than one does!

Rooms are named with a memorable word-pair, like `feral-crayon`. Share the code or the link; players drop in from any browser, phones included, but best experienced with a mouse or drawing pen.

## Highlights

- **Anonymous two-category voting.** The gallery is shuffled per player and nameless until the reveal, so you vote on the drawing, not the drawer. Nobody drew, or nobody voted? The original quietly takes the win.
- **Server-authoritative, so no cheating.** Phase, timer, submissions, and the vote tally all live on the server. Drawings stay hidden until voting; you only ever see a live "X of Y finished" count during the round.
- **Reconnect-safe.** Drop and rejoin. Your drawing, votes survive. The GM reclaims their role on reconnect, or hands it off; if they vanish, the longest-present player steps up.
- **Palettes you can actually match.** Ask for 24 colours and the room paints with exactly 24, from a palette derived from the image itself.
- **Any raster upload, handled gracefully.** Transparency is flattened onto a background colour you choose.
- **Music and sound.** The GM can pick a per-round, royalty-free soundtrack that fades in when drawing starts and carries through the reveal. Music, effects, and the countdown tick are independent per-device toggles.
- **Solo paint sandbox.** The [`/paint`] route is a single-player canvas; for warming up, testing palettes, or just goofing around. No timer and your progress gets saved on your device.

## Stack

- Vite + Vue 3 (Composition API, `<script setup>`) + TypeScript, canvas-based drawing
- [PartyServer](https://github.com/cloudflare/partyserver) on Cloudflare Durable Objects for realtime rooms, deployed with `wrangler` — see [`party/README.md`](./party/README.md) for the server guide
- `partysocket` WebSocket client (auto-reconnect)
- [Howler.js](https://howlerjs.com/) for audio — one preloaded sprite for zero-latency sound effects, streamed per-track music, per-device mute toggles
- `unique-names-generator` for memorable room codes and for de-duplicating player names, both from a custom curated word list
- Client-side image pipeline: flatten onto an opaque background, one exact downscale to the grid, median-cut palette derivation + near-duplicate merge, then per-cell quantisation. No dependencies, no server image processing, no image storage.

## Developing

Run it locally and dig in — tooling, conventions, project layout, and deploy are all in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Licences

Third-party assets are recorded in [`LICENSE.md`](./LICENSE.md): the background music (upbeat by Kevin MacLeod, **CC-BY 4.0**; classical by Gregor Quendel, **CC BY-NC 4.0** via classicals.de and the **Pixabay Content License**), the self-hosted fonts (**SIL OFL 1.1**) and the bundled dependencies (MIT/ISC). Every track's credit is shown in-app under **Credits** in the settings menu, grouped by source — CC-BY and CC BY-NC both require a visible attribution.
