# pixmaler

A real-time pixel-art party game for DNB coworkers. *Pixel + maler* ("painter" in Norwegian).

> **Not built yet** — this repo currently holds the design. See [`docs/plans/01-pixmaler.md`](./docs/plans/01-pixmaler.md) for the full build plan.

## What it does

A game master uploads any image. It's quantized in the browser into chunky, limited-palette pixel art — that's the **target**. Everyone in the room then races a countdown to redraw the target by hand on a matching pixel canvas, using only the swatch of allowed colours. No eraser: you paint over your mistakes. When the timer runs out, every drawing is shown side-by-side and **anonymous**, and the room votes for its favourite. Then the ranked reveal: scores, authors, and the gloriously bad results.

- **Memorable room codes** — join a game with a word-pair like `feral-crayon`, easy to read aloud across a desk.
- **Server-authoritative** — phase, timer, submissions, and vote tallying all live on the server, so no client can cheat the clock or the count.
- **Blind reveal** — nobody sees anyone else's drawing until voting; you only see a live "X of Y finished" tally during the round.
- **Reconnect-safe** — drop and rejoin with the same identity; your slot (and your vote) survive.

## Stack

- Vite + TypeScript, vanilla DOM (no framework), canvas-based drawing
- [PartyKit](https://www.partykit.io/) on Cloudflare Durable Objects for realtime rooms
- `partysocket` WebSocket client (auto-reconnect)
- `unique-names-generator` for memorable room codes (custom curated word list)
- Client-side median-cut quantization — no server image processing, no image storage

## Setup

```bash
pnpm install
pnpm dev               # Vite frontend
pnpm dlx partykit dev  # realtime server on :1999 (separate terminal)
```

Set `VITE_PARTYKIT_HOST` (`127.0.0.1:1999` in dev).

## Deploy

Two targets:

```bash
pnpm build                 # → dist/, deployed to GitHub Pages at /pixmaler/
pnpm dlx partykit deploy   # realtime server → Cloudflare
```

GitHub Actions deploys the frontend on push to `main`. The PartyKit server deploys separately — GitHub Pages can't host it.
