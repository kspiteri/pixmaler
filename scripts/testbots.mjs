// Test bots for local playtesting — connect N players to a room over WebSocket, submit an
// imperfect redraw of the round's target during DRAWING, and vote during VOTING. Lets you
// populate a round instantly instead of driving the drawing UI under the timer.
//
//   node scripts/testbots.mjs --room=golden-watercolor --count=5   # 1-10 bots, local :1999
//
// Order: the GM (a real browser) must open/create the room first; then launch the bots so they
// join the live room as drawers before the round starts. They reset each round (LOBBY → play
// again works). Kill with Ctrl-C. Needs Node 18+ (global WebSocket via partysocket).

import process from 'node:process'
import PartySocket from 'partysocket'

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/)
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), 'true']
}))
const ROOM = args.room ?? 'golden-watercolor'
const HOST = args.host ?? '127.0.0.1:1999' // local only; prod refuses non-browser sockets by design
const COUNT = Math.min(10, Math.max(1, Math.floor(Number(args.count)) || 5)) // 1-10 (NAMES caps at 10)
const PARTY = 'pixmaler-server'

const NAMES = ['blob ross', 'sir sketch-a-lot', 'doodle dora', 'pablo pixelso', 'van gogh-ish', 'gary the goblin', 'frida callout', 'claude monét', 'the intern', 'captain scribble']
const SHAPES = ['rounded', 'square', 'circle', 'hexagon', 'octagon', 'leaf']

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Drawing: a human-ish redraw of the target ──────────────────────────────────
// Not a bad scan: a coherent unfinished region, a few misplaced/miscoloured blobs, and a
// scatter of cells nudged to a *nearby* palette colour (close but imprecise).
function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
// For each palette index, the other indices sorted by colour distance (nearest first).
function paletteNeighbours(palette) {
  const rgb = palette.map(hexToRgb)
  return rgb.map((c, i) => rgb
    .map((d, j) => [j, (c[0] - d[0]) ** 2 + (c[1] - d[1]) ** 2 + (c[2] - d[2]) ** 2])
    .filter(([j]) => j !== i)
    .sort((a, b) => a[1] - b[1])
    .map(([j]) => j))
}

function redraw(target, gridW, gridH, palette, seed) {
  const rng = mulberry32(seed)
  const g = target.slice()
  const skill = rng() ** 1.4 // skewed low, so most bots are middling-to-bad
  const near = paletteNeighbours(palette)

  // Ran out of time: leave a coherent trailing region unfinished (drawn top-to-bottom).
  if (rng() < 0.6) {
    const cut = Math.floor((0.3 + skill * 0.6) * g.length)
    for (let j = cut; j < g.length; j++)
      g[j] = -1
  }

  // A few misplaced blobs — a smudge missed, or a small patch of the wrong colour.
  const blobs = 1 + Math.floor((1 - skill) * 4)
  for (let b = 0; b < blobs; b++) {
    const bw = 2 + Math.floor((rng() * gridW) / 4)
    const bh = 2 + Math.floor((rng() * gridH) / 4)
    const x0 = Math.floor(rng() * gridW)
    const y0 = Math.floor(rng() * gridH)
    const miss = rng() < 0.3
    const wrong = Math.floor(rng() * palette.length)
    for (let y = y0; y < Math.min(y0 + bh, gridH); y++) {
      for (let x = x0; x < Math.min(x0 + bw, gridW); x++) {
        const idx = y * gridW + x
        if (g[idx] !== -1)
          g[idx] = miss ? -1 : wrong
      }
    }
  }

  // Colour drift: nudge scattered cells to one of the nearest few palette colours.
  const drift = 0.05 + (1 - skill) * 0.3
  for (let i = 0; i < g.length; i++) {
    if (g[i] === -1)
      continue
    if (rng() < drift) {
      const nb = near[g[i]]
      if (nb.length)
        g[i] = nb[Math.floor(rng() * Math.min(3, nb.length))]
    }
  }
  return g
}

// ── Voting: prefer by merit, not a coin toss ───────────────────────────────────
// Score each drawing against the target the bot itself holds, then pick with weighted
// randomness (a floor keeps it non-deterministic): `best` rewards an accurate, complete
// redraw; `funniest` rewards effort-gone-wrong — filled in, but nothing like the target.
function scoreSub(grid, target) {
  let filled = 0
  let correct = 0
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === -1)
      continue
    filled++
    if (target && grid[i] === target[i])
      correct++
  }
  return { completeness: filled / grid.length, accuracy: filled ? correct / filled : 0 }
}
function weightedPick(items, weightOf, rng) {
  const weights = items.map(weightOf)
  const sum = weights.reduce((a, w) => a + w, 0)
  let r = rng() * sum
  for (let k = 0; k < items.length; k++) {
    r -= weights[k]
    if (r <= 0)
      return items[k]
  }
  return items[items.length - 1]
}

function log(s) {
  console.log(`[testbots] ${s}`)
}

function bot(i) {
  const clientId = `bot-${Date.now().toString(36)}-${i}`
  const name = NAMES[i % NAMES.length]
  const shape = SHAPES[i % SHAPES.length]
  const st = { phase: null, config: null, target: null, gallery: null, mySub: undefined, gotVS: false, submitted: false, voted: false }
  const ws = new PartySocket({ host: HOST, party: PARTY, room: ROOM })
  const send = m => ws.send(JSON.stringify(m))

  function reset() {
    st.submitted = false
    st.voted = false
    st.gotVS = false
    st.gallery = null
  }
  function maybeDraw() {
    if (st.submitted || st.phase !== 'DRAWING' || !st.target || !st.config)
      return
    st.submitted = true
    const { gridW, gridH, palette } = st.config
    send({ type: 'draw:submit', grid: redraw(st.target, gridW, gridH, palette, i * 7919 + 13) })
    send({ type: 'draw:done' })
    log(`${name}: submitted a redraw`)
  }
  function maybeVote() {
    if (st.voted || st.phase !== 'VOTING' || !st.gallery || !st.gotVS)
      return
    const others = st.gallery.submissions.filter(s => s.submissionId !== st.mySub && !s.grid.every(c => c === -1))
    if (!others.length)
      return
    st.voted = true
    const rng = mulberry32(i * 104729 + 7)
    const scored = others.map(s => ({ id: s.submissionId, ...scoreSub(s.grid, st.target) }))
    const best = weightedPick(scored, s => (s.accuracy * 0.7 + s.completeness * 0.3) ** 3 + 0.02, rng)
    const funniest = weightedPick(scored, s => (s.completeness * (1 - s.accuracy)) ** 2 + 0.02, rng)
    send({ type: 'vote:cast', category: 'funniest', submissionId: funniest.id })
    send({ type: 'vote:cast', category: 'best', submissionId: best.id })
    log(`${name}: voted`)
  }

  ws.addEventListener('open', () => {
    send({ type: 'join', clientId, name, shape })
    log(`${name}: joined`)
  })
  ws.addEventListener('message', (ev) => {
    let m
    try { m = JSON.parse(ev.data) }
    catch { return }
    switch (m.type) {
      case 'target': st.target = m.grid; break
      case 'gallery': st.gallery = m; break
      case 'vote-state': st.mySub = m.mySubmissionId; st.gotVS = true; break
      case 'no-such-room':
        log(`${name}: room not open yet — retrying in 2s (start the GM first)`)
        setTimeout(send, 2000, { type: 'join', clientId, name, shape })
        break
      case 'room-full': log(`${name}: room is full`); break
      case 'session-closed':
        log(`${name}: session closed — the room is gone, exiting`)
        process.exit(0)
        break
      case 'state':
      case 'phase': {
        const prev = st.phase
        st.phase = m.phase
        if (m.config)
          st.config = m.config
        if (m.phase === 'LOBBY' && prev && prev !== 'LOBBY')
          reset()
        break
      }
    }
    maybeDraw()
    maybeVote()
  })
  ws.addEventListener('error', () => {})
}

log(`connecting ${COUNT} bots to "${ROOM}" @ ${HOST} …`)
for (let i = 0; i < COUNT; i++)
  setTimeout(bot, i * 250, i)
