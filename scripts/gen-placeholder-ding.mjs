// Generates a placeholder press "ding" as a mono 48 kHz PCM WAV — a stopgap so the audio
// foundation (#94) has an audible sfx before the recorded sprite (#95) lands, which replaces
// this asset. Run: `node scripts/gen-placeholder-ding.mjs`. No external tools (no ffmpeg).

import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RATE = 48_000
const MS = 400
const FREQ = 988 // ~B5, a bright but soft blip

const n = Math.round((RATE * MS) / 1000)
const samples = new Int16Array(n)
for (let i = 0; i < n; i++) {
  const t = i / RATE
  const env = Math.exp(-t * 12) // exponential decay — no click on release
  const shimmer = 0.5 * Math.sin(2 * Math.PI * FREQ * 2 * t) * Math.exp(-t * 18)
  const s = (Math.sin(2 * Math.PI * FREQ * t) + shimmer) * env * 0.6
  samples[i] = Math.round(Math.max(-1, Math.min(1, s)) * 32_767)
}

const dataBytes = samples.length * 2
const buf = Buffer.alloc(44 + dataBytes)
buf.write('RIFF', 0)
buf.writeUInt32LE(36 + dataBytes, 4)
buf.write('WAVE', 8)
buf.write('fmt ', 12)
buf.writeUInt32LE(16, 16)
buf.writeUInt16LE(1, 20) // PCM
buf.writeUInt16LE(1, 22) // mono
buf.writeUInt32LE(RATE, 24)
buf.writeUInt32LE(RATE * 2, 28) // byte rate
buf.writeUInt16LE(2, 32) // block align
buf.writeUInt16LE(16, 34) // bits per sample
buf.write('data', 36)
buf.writeUInt32LE(dataBytes, 40)
for (let i = 0; i < samples.length; i++)
  buf.writeInt16LE(samples[i], 44 + i * 2)

const outDir = fileURLToPath(new URL('../public/assets/audio', import.meta.url))
mkdirSync(outDir, { recursive: true })
writeFileSync(`${outDir}/sfx.wav`, buf)
console.log(`wrote ${outDir}/sfx.wav (${buf.length} bytes)`)
