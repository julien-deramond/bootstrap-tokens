# CLAUDE.md

Notes for AI agents working in this repository. The full contributor guide is
[`CONTRIBUTING.md`](CONTRIBUTING.md); this file holds the parts that are easy to get wrong.

## Findings become issues, not notes

When you notice a bug, want a feature, or see something that could be better, **open a GitHub
issue on `julien-deramond/bootstrap-tokens`**. Not a note in a markdown file, not a `TODO`
comment, not a paragraph at the end of an answer. Never open an issue on `twbs/bootstrap` or
any other repository — if the bug is upstream, open it here with the `upstream` label, say
plainly that the fix belongs to Bootstrap, and let a human decide whether to carry it over.

Label every issue you open with:

* `ai-submitted` — you opened it;
* exactly one of `bug`, `feature` or `enhancement` (add `documentation` or `accessibility`
  when they apply);
* `needs-triage` — always. **Never apply `ready-to-dev` yourself.**
* `upstream`, when the defect is in `twbs/bootstrap` rather than here.

```bash
gh issue create \
  --title "…" \
  --label ai-submitted --label bug --label needs-triage \
  --body-file <file>
```

Write the body for a person: what is wrong, why it matters, the evidence that convinced you,
the files involved, a proposed change, and how we would know it is done. The test is whether
a contributor who was not in this conversation could pick it up. Prose, not a transcript of
your reasoning. If you did not compile or run it, say so.

## Only `ready-to-dev` work is available

`needs-triage` → a human reads it and swaps the label → `ready-to-dev` → free to pick up.

```bash
gh issue list --label ready-to-dev --state open
```

When asked to take available work, that list is the whole of what is available. An issue
still in `needs-triage` is not available however obvious the fix looks — report it as waiting
on triage rather than starting it. Comment on an issue when you take it, and close it from
the pull request with `Closes #N`.

## Every change lands as a pull request

Never commit to `main` and never merge your own work. Branch, commit, push, open the pull
request, then tell the maintainer it is ready and stop.

```bash
git switch -c feat/short-name
gh pr create --title "feat: …" --body-file <file> --label ai-submitted --label enhancement
```

The description is for the person reviewing it: what changed and why, what it affects beyond
the obvious, how you verified it, what you deliberately left out, and `Closes #N` when it
finishes an issue. Prose, not a file-by-file list — the diff already says which files moved.

Label it with the same type label as its issue plus `ai-submitted`. Triage labels
(`needs-triage`, `ready-to-dev`) belong on issues only. Never enable auto-merge.

## Repository rules worth repeating

* `build/` is committed. Change the token document or an exporter and you must run
  `npm run build` and commit the result, or CI fails.
* `tokens/` is generated from upstream. Fix the extractor in `tools/lib/`, never the output.
* No runtime dependencies. `sass` and `style-dictionary` stay dev-only.
* Before pushing: `npm run validate && npm test && npm run build && npm run verify`.
