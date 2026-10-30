---
name: git-and-pr-conventions
description: Write a branch name, a commit or a pull request in this repository. Use it before creating a branch, before every commit, and before opening or retitling a pull request.
---

# Writing branch names, commits and pull requests

The rules are in [`docs/engineering/git-and-pr-conventions.md`](../../../docs/engineering/git-and-pr-conventions.md);
it wins where this extract disagrees. Validate **before** the object exists.

| Object             | Shape                                   | Validate with                     |
| ------------------ | --------------------------------------- | --------------------------------- |
| Branch name        | `<type>/<kebab-description>`            | `--branch '<name>'`               |
| Commit subject     | `<type>(optional-scope): <description>` | `--commit -` (subject on `stdin`) |
| Pull request title | the same as a commit subject            | `--title '<text>'`                |

## Procedure

1. **See the change:** `git diff --staged --stat` (and the full diff if needed). For a new branch,
   name it from the work you are about to do.
2. **Pick the type** from the table in the convention. If the diff does two things, make two
   commits.
3. **Write it:** optional lowercase scope (`bookmarks`, `web`, `tools`), imperative description,
   lowercase start, no trailing period. Say what the change does, not which files moved.
4. **Validate:**

   ```bash
   pnpm validate:conventions --branch 'feat/bookmark-search'
   printf '%s' "$subject" | pnpm validate:conventions --commit -
   pnpm validate:conventions --title 'feat(bookmarks): add full-text search'
   ```

   Exit `1` names the broken rule and an example; fix and rerun. Exit `2` means the tool failed.

5. **Act:** `git switch -c '<name>'` · `git commit -m "$subject"` · `git push -u origin '<name>'` ·
   `tea pulls create --head '<name>' --base master --title '<text>' --description-file body.md`.
   The repository lives on Gitea; push only to `origin` (the GitHub copy is a mirror) and use
   `tea`, not `gh`. If `tea` finds no login for the remote, add `--login <name> --repo <owner>/<repo>`.
6. **Pull request body:** the headings of `.github/PULL_REQUEST_TEMPLATE.md` (`## TL;DR`,
   `## Impact`, `## Links`). `tea pulls create` does not prefill the template, so write the
   headings yourself. Do not list checks you ran; CI reports them.

## Remember

- The pull request title becomes the squash commit on `master`; it describes the finished branch.
- Re-validate after any retitle.
- Merge your own pull request only when CI is green and no human gate is open:
  `tea pulls merge <number> --style squash --title '<text>'`.
