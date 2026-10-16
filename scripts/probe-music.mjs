#!/usr/bin/env node
// Probe every bundled music track's length with ffprobe and print `id: seconds` lines, so the
// durationS values in src/lib/content/music.ts can be regenerated when a track is added or
// re-encoded. Needs ffprobe (ffmpeg) on PATH. Run: pnpm music:durations

import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'public/assets/audio/music'

const rows = []
for (const category of readdirSync(ROOT)) {
  const dir = join(ROOT, category)
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.webm'))
      continue
    const out = execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      join(dir, entry),
    ], { encoding: 'utf8' })
    rows.push([entry.slice(0, -'.webm'.length), Math.round(Number.parseFloat(out.trim()))])
  }
}

rows.sort((a, b) => a[0].localeCompare(b[0]))
for (const [id, seconds] of rows)
  console.log(`${id}: ${seconds}`)
