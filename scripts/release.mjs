// Release helper: gate, deploy the Worker if it changed, merge the release-please PR, watch
// the deploy, name the GitHub release, then pull the bot's version-bump commit. The destructive steps (deploy, merge) prompt first
// unless --yes. Server-before-merge is deliberate: Pages publishes on merge, so the new server
// must already be live — an old server tolerates new clients, the reverse breaks live rooms.
//
//   node scripts/release.mjs                 # prompt before deploy and merge
//   node scripts/release.mjs --yes           # skip the prompts
//   node scripts/release.mjs --theme "…"     # release name words (2-3), else you're asked

import { spawnSync } from 'node:child_process'
import process from 'node:process'
import * as readline from 'node:readline/promises'

const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log('Usage: node scripts/release.mjs [--yes] [--theme "two or three words"]')
  console.log('  Gates (lint, lint:css, typecheck, test, build, worker dry-run), then — if the')
  console.log('  Worker changed — deploys it, merges the release PR, watches the run, names the release, then pulls main.')
  process.exit(0)
}
const SKIP_PROMPTS = args.includes('--yes')
const themeArg = (() => {
  const i = args.indexOf('--theme')
  return i >= 0 ? args[i + 1] : undefined
})()

function fail(msg) {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit' })
  if (r.status !== 0)
    fail(`\`${cmd} ${cmdArgs.join(' ')}\` exited ${r.status ?? r.signal}`)
}

function capture(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8' })
  if (r.status !== 0)
    fail(`\`${cmd} ${cmdArgs.join(' ')}\` exited ${r.status ?? r.signal}\n${r.stderr ?? ''}`)
  return (r.stdout ?? '').trim()
}

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(question)
  rl.close()
  return answer.trim()
}

async function confirm(question) {
  if (SKIP_PROMPTS)
    return true
  return /^y(?:es)?$/i.test(await ask(`${question} [y/N] `))
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  // Preflight: a clean main, synced with the remote.
  const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch !== 'main')
    fail(`on '${branch}', not main — release from main`)
  if (capture('git', ['status', '--porcelain']))
    fail('the working tree is dirty; commit or stash first')
  run('git', ['pull', '--ff-only'])

  // 1. Gates — the same checks CI runs, plus the build and worker dry-run.
  console.log('\n\u25B6 gates')
  for (const script of ['lint', 'lint:css', 'typecheck', 'test', 'build'])
    run('pnpm', [script])
  run('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run'])

  // 2. Deploy the Worker first — but only if it actually changed since the last tag, because a
  // deploy ends every live room. These are everything the Worker bundle reads; keep in step with
  // party/'s imports.
  const lastTag = capture('git', ['describe', '--tags', '--abbrev=0'])
  const workerPaths = ['party', 'src/lib/protocol', 'src/lib/content/words.ts', 'src/lib/canvas/palette.ts', 'wrangler.jsonc']
  const serverDiff = capture('git', ['diff', '--name-only', `${lastTag}..HEAD`, '--', ...workerPaths])
  if (serverDiff) {
    console.log(`\n\u25B6 the Worker changed since ${lastTag}:\n${serverDiff}`)
    if (!(await confirm('Deploy the Worker now? This ENDS every live room.')))
      fail('declined the Worker deploy — nothing released (it must ship before the merge)')
    run('pnpm', ['wr:deploy'])
  }
  else {
    console.log(`\n\u25B6 the Worker is unchanged since ${lastTag} — skipping its deploy`)
  }

  // 3. Merge the release-please PR (it carries the `autorelease: pending` label).
  const prs = JSON.parse(capture('gh', ['pr', 'list', '--label', 'autorelease: pending', '--state', 'open', '--json', 'number,title']) || '[]')
  if (prs.length === 0)
    fail('no open release PR found (label "autorelease: pending")')
  const { number, title } = prs[0]
  const version = (title.match(/release\s+v?([\d.]+)/i) ?? [])[1]
  if (!version)
    fail(`could not read a version from the PR title: "${title}"`)
  console.log(`\n\u25B6 release PR #${number}: ${title}`)
  if (!(await confirm(`Merge PR #${number} and publish v${version}?`)))
    fail('declined the merge — nothing published')
  run('gh', ['pr', 'merge', String(number), '--squash'])

  // 4. Watch the release workflow through (it tags, publishes the release, and deploys Pages).
  console.log('\n\u25B6 waiting for the release run')
  let runId = ''
  for (let i = 0; i < 12 && !runId; i++) {
    await sleep(5000)
    runId = capture('gh', ['run', 'list', '--workflow', 'release.yml', '--branch', 'main', '--limit', '1', '--json', 'databaseId', '--jq', '.[0].databaseId // ""'])
  }
  if (!runId)
    fail('the release run did not appear — check the Actions tab')
  run('gh', ['run', 'watch', runId, '--exit-status'])

  // 5. Name the release: `v<version> <two or three words>`, as the past releases do.
  let theme = themeArg ?? (SKIP_PROMPTS ? '' : await ask('\nRelease name (2-3 words, relevant to what shipped): '))
  theme = theme.trim()
  if (theme) {
    run('gh', ['release', 'edit', version, '--title', `v${version} ${theme}`])
    console.log(`\n\u2713 released v${version} — ${theme}`)
  }
  else {
    console.log(`\n\u2713 released v${version} (no name set; add one with: gh release edit ${version} --title "v${version} <words>")`)
  }

  // 6. Everything's live and verified — pull the release-please commit (version bump + CHANGELOG)
  // back into local main so the working copy isn't left behind the remote.
  console.log('\n\u25B6 syncing local main with the release')
  run('git', ['pull', '--ff-only'])
}

main().catch(err => fail(err instanceof Error ? err.message : String(err)))
