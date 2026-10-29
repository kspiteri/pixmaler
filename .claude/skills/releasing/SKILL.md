---
name: releasing
description: Cut a Pixmaler release with `pnpm release` (release-please). Use when asked to release, ship a version, publish, or deploy the frontend. Covers the one-command flow, the Worker-before-merge rule, release naming, and — crucially — how to recover when the GitHub run status stalls after the deploy is already live.
---

# Releasing Pixmaler

The canonical "why" lives in [`CONTRIBUTING.md`](../../../CONTRIBUTING.md) ("Cutting a release") and
[`AGENTS.md`](../../../AGENTS.md) ("Deployment"). This skill is the operational playbook: the command,
the rules that bite, and the recovery steps for the failure modes that actually happen.

## The model

- **release-please keeps a "Release PR" open** that accumulates every conventional commit on `main`,
  with the next version written into `package.json` + `CHANGELOG.md`. **Merging that PR is the release.**
- **Pages (frontend) deploys itself** on merge, via `.github/workflows/release.yml`.
- **The Worker (realtime server) is deployed by hand** — `pnpm wr:deploy` — and only when it changed.
  A Worker deploy **ends every live room** (room state is in memory), so it's never a ritual.

## The one command

```bash
pnpm release                      # prompts before the destructive steps (deploy, merge)
pnpm release --yes                # skip the prompts
pnpm release --theme "Two Words"  # preset the release name (else you're asked)
```

`scripts/release.mjs` runs, in order:

1. **Preflight** — must be on a clean `main`, `git pull --ff-only`.
2. **Gates** — `lint`, `lint:css`, `typecheck`, `test`, `build`, then `wrangler deploy --dry-run`.
3. **Worker deploy — only if it changed.** Diffs `party/`, `src/lib/protocol/`, `src/lib/content/words.ts`,
   `src/lib/canvas/palette.ts` and `wrangler.jsonc` since the last tag; if non-empty, prompts, then
   `pnpm wr:deploy`. **Server before merge** — an updated server tolerates older clients while the
   reverse breaks live rooms.
4. **Merge the Release PR** (`gh pr merge --squash`) — this tags, publishes the GitHub release, and
   triggers the Pages deploy.
5. **Watch the run** (`gh run watch <id> --exit-status`).
6. **Name the release** — `v<version> <2-3 words>` reflecting what shipped (e.g. `v0.16.0 Quantisation & Confetti`).
7. **`git pull --ff-only`** — bring release-please's version-bump commit back into local `main`.

## gh auth note

`gh` may be logged into more than one host (e.g. a corporate GHE **and** github.com as `kspiteri`).
Pass `--repo kspiteri/pixmaler` on any `gh` call that could resolve against the wrong host. Confirm with
`gh auth status`.

## Recovery: the run hangs after the deploy is already live

The most common snag: step 5's `gh run watch` **never returns** because GitHub leaves the run/deployment
status at `in_progress` (or `waiting`) even though the deploy finished. This is a GitHub status-propagation
stall, **not** a workflow bug — the frontend is live.

**Confirm the deploy actually succeeded** (steps all green despite the stuck run status):

```bash
gh run view <run-id> --repo kspiteri/pixmaler --json status,jobs \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('run:',d['status']); [print(' ',j['name'],j['status'],'| steps:',*[f\"{s['name']}={s['conclusion']}\" for s in j.get('steps',[])]) for j in d['jobs']]"
```

If the `pages` job's `Run actions/deploy-pages@v5` step **and** `Complete job` are `success`, the site is
published. The run flipping to `completed` is just bookkeeping.

**Then finish the leftover steps by hand** (the script can't get past the watch):

```bash
# 6. name the release (tag has no `v` prefix; title does)
gh release edit <version> --repo kspiteri/pixmaler --title "v<version> <two or three words>"
# 7. sync local main with the version-bump commit
git pull --ff-only
```

It is safe to **Ctrl-C the hung `pnpm release`** once the deploy is confirmed live — everything it was
guarding is done. Do **not** cancel-and-fresh-push to retry: release-please has already published the
version, so a new run reports `release_created=false` and **skips the Pages job entirely**. To re-attempt
only a genuinely failed Pages deploy, cancel the run then `gh run rerun <id> --failed` (preserves the
successful `release` job's outputs so `pages` runs again).

## Facts worth keeping straight

- Tags are **unprefixed** (`0.16.0`); release **titles** carry the `v` (`v0.16.0 …`). `gh release edit`
  takes the tag.
- Pre-1.0: a `feat` bumps the **minor**, `!`/`BREAKING CHANGE` never forces 1.0 (`bump-minor-pre-major`).
- `refactor`/`build`/`ci` appear under *Under the hood* and, on their own, cut a patch release;
  `docs`/`test`/`chore`/`style` are hidden and never trigger one.
- After releasing, **close the milestone** it completes, if any.
