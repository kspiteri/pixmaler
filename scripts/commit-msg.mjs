#!/usr/bin/env node
// `commit-msg` hook: checks the subject line is a Conventional Commit, and when it
// isn't, explains the format rather than just refusing.
//
// This exists because release-please derives the next version from commit types — a
// `feat:` bumps the minor, a `fix:` the patch, a `!` the major. An unparseable message
// is not a style problem: it silently drops out of the release notes and out of the
// version calculation. Hence a hook rather than a habit.
//
// No dependency on commitlint on purpose: the grammar is small, and a bespoke check
// can print the repo's own scopes and say what each type does to the version, which is
// the part that actually stops the mistake recurring.

/* eslint-disable node/prefer-global/process */

import { readFileSync } from 'node:fs'

// What each type means here. The version column is release-please's behaviour, not a
// convention we invented — `feat` -> minor, `fix` -> patch, everything else -> no bump
// but it still appears in the notes.
const TYPES = {
  feat: ['a new capability a player can notice', 'minor'],
  fix: ['a defect repaired', 'patch'],
  perf: ['faster or lighter, same behaviour', 'patch'],
  refactor: ['same behaviour, better shape', '—'],
  docs: ['documentation only', '—'],
  test: ['tests only', '—'],
  build: ['build, deps or tooling', '—'],
  ci: ['workflows and automation', '—'],
  chore: ['housekeeping that fits nowhere else', '—'],
  style: ['formatting only, no code change', '—'],
  revert: ['undoes an earlier commit', '—'],
}

// Optional, but they group the release notes usefully — deliberately mirroring the
// `area:*` labels on the issue tracker so a note and an issue describe the same place.
const SCOPES = ['lobby', 'drawing', 'voting', 'results', 'server', 'pipeline', 'a11y', 'canvas', 'deps', 'ci']

const path = process.argv[2]
if (!path) {
  console.error('commit-msg hook: no message file was passed.')
  process.exit(1)
}

const raw = readFileSync(path, 'utf8')
// Comment lines are stripped by git afterwards; ignore them and any leading blanks.
const subject = raw
  .split('\n')
  .filter(l => !l.startsWith('#'))
  .join('\n')
  .trim()
  .split('\n')[0] ?? ''

// Git writes these itself and they are not ours to reformat. `\b` only guards the word
// forms — after `fixup!` the `!` and the following space are both non-word characters,
// so a boundary can never match there.
if (/^(?:Merge\b|Revert\b|fixup!|squash!|amend!)/.test(subject))
  process.exit(0)

const PATTERN = /^([a-z]+)(?:\(([a-z0-9:-]+)\))?(!)?: (.+)$/
const match = subject.match(PATTERN)

function fail(problem, extra) {
  const width = Math.max(...Object.keys(TYPES).map(t => t.length))
  console.error(`
✗ ${problem}

  your message   ${subject || '(empty)'}
  the format     type(scope)?!?: subject

${Object.entries(TYPES).map(([t, [why, bump]]) => `  ${t.padEnd(width)}  ${bump.padEnd(6)} ${why}`).join('\n')}

  ! after the type, or a "BREAKING CHANGE:" body line, bumps the major.
  scope is optional. Ones in use: ${SCOPES.join(', ')}

  examples
    fix(voting): show the confirmation while the cursor rests on the button
    feat(lobby): explain the GM's job to whoever holds the role
    refactor(server)!: split the room into modules
${extra ? `\n  ${extra}\n` : ''}
  Bypass once with --no-verify, but the commit will not appear in the release notes.
`)
  process.exit(1)
}

if (!match)
  fail('that commit subject is not a Conventional Commit.')

const [, type, scope, breaking, description] = match

if (!(type in TYPES)) {
  const known = Object.keys(TYPES)
  // Cheap nearest-match: a prefix hit is nearly always the intended type.
  const guess = known.find(t => t.startsWith(type.slice(0, 3)) || type.startsWith(t))
  fail(`"${type}" is not a known type.`, guess ? `Did you mean "${guess}"?` : undefined)
}

if (scope && !SCOPES.includes(scope)) {
  // A warning, not a failure — a new area is legitimate, and blocking it would just
  // teach people to use --no-verify.
  console.warn(`\n⚠ "${scope}" is a new scope. Fine if deliberate; add it to scripts/commit-msg.mjs so the next person sees it.\n`)
}

if (description.length < 8)
  fail('the description is too short to be useful in a release note.')

if (/^[A-Z]/.test(description) && !/^[A-Z]{2,}/.test(description))
  fail('start the description lowercase — it reads as a sentence fragment after the colon.')

if (description.endsWith('.'))
  fail('drop the trailing full stop: the subject is a title, not a sentence.')

if (subject.length > 72)
  fail(`the subject is ${subject.length} characters; keep it under 72 so it does not wrap in a log.`)

void breaking
