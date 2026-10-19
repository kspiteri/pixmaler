// Runs the Vite frontend and the realtime Worker together with one command, and stops both
// cleanly on Ctrl-C or when either exits — a half-running pair is a trap. The parts are still
// `pnpm dev` and `pnpm wr:dev`; this only saves the second terminal.

import { spawn } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const node = process.execPath
const entry = name => fileURLToPath(new URL(`../node_modules/${name}`, import.meta.url))

const targets = [
  { label: 'web', args: [entry('vite/bin/vite.js'), '--host', '127.0.0.1'] },
  { label: 'wr', args: [entry('wrangler/bin/wrangler.js'), 'dev'] },
]

let stopping = false
const children = []

function stopAll() {
  if (stopping)
    return
  stopping = true
  for (const child of children)
    child.kill('SIGTERM')
}

for (const { label, args } of targets) {
  const child = spawn(node, args, { stdio: 'inherit' })
  child.on('exit', (code) => {
    if (!stopping)
      console.log(`[dev] ${label} exited (${code ?? 0}); stopping the other`)
    process.exitCode = code ?? 0
    stopAll()
  })
  children.push(child)
}

process.on('SIGINT', stopAll)
process.on('SIGTERM', stopAll)
