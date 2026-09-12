# Contributing

Thanks for taking a look. This project tracks a moving target — `twbs/bootstrap@v6-dev` is an
alpha — so bug reports about drift are as useful as pull requests.

## Getting set up

```bash
git clone https://github.com/julien-deramond/bootstrap-tokens.git
cd bootstrap-tokens
npm install
git clone --depth 1 -b v6-dev https://github.com/twbs/bootstrap.git ../bootstrap
```

Bootstrap 6 is not on npm yet, so a `v6-dev` checkout is what the tooling reads. Point at one
elsewhere with `--src <path>`, `$BOOTSTRAP_SRC`, or a `bootstrap-tokens.config.json`
containing `{ "bootstrapSource": "<path>" }`.

Then:

```bash
npm run validate   # the token document is well formed
npm test           # unit tests
npm run build      # regenerate build/ and docs/token-inventory.md
npm run verify     # our export compiles to the same CSS as upstream
npm run web        # the Theme Builder, on http://localhost:4000
```

## Issues and triage

Work is tracked as GitHub issues on
[`julien-deramond/bootstrap-tokens`](https://github.com/julien-deramond/bootstrap-tokens/issues)
— this repository, never `twbs/bootstrap`. That includes findings *about* Bootstrap 6: they
are opened here with the `upstream` label, and a maintainer decides at triage whether to
carry them to `twbs/bootstrap`. Nobody files on another project's tracker on this project's
behalf.

Every issue carries a type label and a state label, plus `ai-submitted` when a machine
opened it:

| | Labels | Who sets them |
| --- | --- | --- |
| **What it is** | `bug`, `feature` or `enhancement`, plus `documentation` or `accessibility` where they apply | whoever opens it |
| **Where it stands** | `needs-triage`, then `ready-to-dev` | `needs-triage` on open; only a maintainer swaps it |
| **Who opened it** | `ai-submitted` | the agent, on its own issues |
| **Whose bug it is** | `upstream`, when the defect is in `twbs/bootstrap` rather than here | whoever opens it |

`bug` is something that does not work. `feature` is a capability that does not exist yet.
`enhancement` is something that already exists working better.

An `upstream` issue is a finding about Bootstrap that this pipeline surfaced — usually by
compiling it, resolving it, or measuring it in a browser, which is how all eight of the
current ones ([#9](https://github.com/julien-deramond/bootstrap-tokens/issues/9)–[#16](https://github.com/julien-deramond/bootstrap-tokens/issues/16)) were found. It stays open here because the
workaround, the `NOT_TOKENS` entry or the lint rule that copes with it lives in this
repository and needs somewhere to point. Triage on one of these means deciding whether the
evidence is strong enough to raise with `twbs/bootstrap` — and if it is raised, linking the
upstream issue in a comment so the two stay connected.

The state labels are a gate, not decoration. **`needs-triage` means no human has read it and
nobody should start work.** Triage is a person reading the issue, sharpening it until it
could be handed to a stranger, and replacing `needs-triage` with `ready-to-dev` — or closing
it. Only a maintainer makes that swap. An issue carrying neither state label is an oversight;
one carrying both is a mistake.

The nightly drift latch is the exception: `upstream-drift` issues open and close themselves
against one condition and are never triaged.

### If you are an AI agent

Read this as instructions, not as background.

* **Noticed something? Open an issue.** Not a note in a markdown file, not a `TODO` comment,
  not a remark at the end of an answer that scrolls out of view. There is no backlog file to
  append to, deliberately.
* **This repository only.** Never open an issue on `twbs/bootstrap`, however clearly the bug
  belongs to them. Open it here with the `upstream` label, say plainly that the fix belongs
  to Bootstrap, and let a human decide whether to carry it over.
* **Label it `ai-submitted`, exactly one type label, and `needs-triage`.** Never put
  `ready-to-dev` on your own issue. That label is the human's signal; applying it yourself
  removes the only gate in this workflow.
* **Write it for a person.** Prose a maintainer can read in a minute, not a transcript of how
  you arrived there. No invented certainty: if you did not compile it, say you did not.
* **Only pick up `ready-to-dev`.** When asked to take available work, that label is the whole
  of what is available. An issue sitting in `needs-triage` is not available however obvious
  the fix looks — report it as waiting on triage instead of starting it.
* **Say when you start and when you stop.** Comment on the issue as you take it, and close it
  from the pull request with `Closes #N` rather than by hand.
* **One issue per thing.** Check the open list before opening a near-duplicate.

Opening one:

```bash
gh issue create \
  --title "sync --check misses variables declared inside @if" \
  --label ai-submitted --label bug --label needs-triage \
  --body-file /tmp/issue.md
```

Use `--body-file` rather than `--body`: a body worth reading is several paragraphs long and
survives a file intact.

Finding work:

```bash
gh issue list --label ready-to-dev --state open
```

### What "enough detail to implement" means

The test is whether a contributor who was not in the conversation could do the work. So the
body covers, in whatever order reads best:

* **What is wrong or missing**, in a sentence, before any detail.
* **Why it matters** — the consequence. A finding with no consequence is a note, not an
  issue, and should not be filed.
* **Evidence** — the command and its output, the diff, the measurement in a browser. This is
  what separates a real finding from a plausible-sounding one.
* **Where it lives** — the files, functions or tokens involved, as paths.
* **A proposed change**, with its trade-off if there is a choice to make. Being wrong here is
  fine and useful; being vague is not.
* **How we would know it is done** — the check that fails today and passes afterwards.
* **What is out of scope**, when the obvious reading of the title is broader than the issue.

### If you are a maintainer

Triage is the only step that cannot be delegated to a machine here. For each `needs-triage`
issue: decide it is real, make the body good enough to hand over, then

```bash
gh issue edit 42 --remove-label needs-triage --add-label ready-to-dev
```

Anything you open yourself is already triaged — label it `ready-to-dev` directly, or leave
the state off and it will be understood as yours. Closing with `wontfix`, `duplicate` or
`invalid` is a triage outcome like any other, and an `ai-submitted` issue that is not worth
keeping should be closed without ceremony.

## Before opening a pull request

CI runs `validate`, `sync --check`, `test`, `build`, the contrast audit, `verify` and
`eject --verify`. Running them locally first is much faster than a round trip. Once those
pass on `main`, CI redeploys the Theme Builder to
[julien-deramond.github.io/bootstrap-tokens](https://julien-deramond.github.io/bootstrap-tokens/).

Two things catch people out:

* **`build/` is committed**, so a change to the token document or an exporter means running
  `npm run build` and committing the result. CI fails if `build/` or
  `docs/token-inventory.md` is stale.
* **`tokens/` is generated from upstream.** Don't hand-edit it to fix an extraction bug — fix
  the extractor in `tools/lib/` and re-run `npm run sync`, or the next sync silently reverts
  you. Deliberate deviations belong in the curation layer, not in the output.

### What a pull request looks like

Work happens on a branch and lands through a pull request — no direct pushes to `main`, so
CI has a chance to fail before the Theme Builder redeploys.

* **Title:** the same conventional-ish prefix as the commits (`fix:`, `feat:`, `docs:`,
  `test:`, `ci:`), saying what changed for a reader.
* **Description:** written for the person reviewing it, in prose. What changed and why, what
  it affects that is not obvious from the diff, how you verified it, and what you deliberately
  left out. A reviewer should not have to reconstruct your reasoning from the files.
  `Closes #42` if it finishes an issue, so the issue closes itself on merge.
* **Labels:** the same type label as the issue it closes — `bug`, `feature`, `enhancement`,
  `documentation`, `accessibility` — plus `ai-submitted` if an agent wrote it. The triage
  labels are for issues and never go on a pull request.

Agents: open the pull request, then stop and ask the maintainer to review it. Never merge
your own, never enable auto-merge, and never push to `main` directly.

## What tends to need doing

* **Upstream drift.** `npm run sync -- --check` reports it; a nightly workflow opens an issue
  when `v6-dev` moves. Re-syncing, reviewing the diff and rebuilding is the routine.
* **Unmodelled surface.** `sync --check` also fails when upstream offers a configurable
  variable the document neither models nor lists in `NOT_TOKENS` with a reason.
* **Findings about upstream.** If the pipeline surfaces a real Bootstrap bug, open an issue
  labelled [`upstream`](https://github.com/julien-deramond/bootstrap-tokens/issues?q=is%3Aissue+label%3Aupstream) with the evidence that convinced
  you — a compile, a diff, or a measurement in a browser. Evidence is the whole value of
  these: several are worth raising with `twbs/bootstrap`, and none of them survives contact
  with a maintainer there without it.

Everything else that needs doing is an [open issue](https://github.com/julien-deramond/bootstrap-tokens/issues?q=is%3Aissue+is%3Aopen+label%3Aready-to-dev)
— `ready-to-dev` is the list of what is actually free to pick up.
[`docs/PLAN.md`](docs/PLAN.md) records what the maintainer thinks is wrong and what comes
next; it is the honest version of a roadmap, and the place ideas live before they are
specific enough to be an issue.

## Style

* Node 20+, ES modules, no build step for the tooling or the web app.
* No runtime dependencies. `sass` and `style-dictionary` are dev-only and stay that way.
* Tests use `node --test`. Prefer running the real tool over asserting the shape of our own
  output — `tools/test/consumers.test.mjs` runs `tsc` and Style Dictionary for that reason.
* Commit messages are conventional-ish (`fix:`, `feat:`, `docs:`, `test:`) and say what
  changed for a reader, not what file was touched.

## Licence

By contributing you agree that your work is licensed under the [MIT Licence](LICENSE).
