# Git and Pull Request Conventions

Short rules for branches, commits and pull requests. `pnpm validate:conventions` checks the
shapes locally, on pre-push and in CI. The [`git-and-pr-conventions`](../../.agents/skills/git-and-pr-conventions/SKILL.md)
skill is the step-by-step procedure.

## 1. Types

`feat` · `fix` · `refactor` · `test` · `docs` · `ci` · `build` · `chore`

| Type       | The change…                                             |
| ---------- | ------------------------------------------------------- |
| `feat`     | adds behaviour a user or caller can observe             |
| `fix`      | corrects behaviour that was wrong                       |
| `refactor` | changes structure, with behaviour held constant         |
| `test`     | touches only tests                                      |
| `docs`     | touches only documentation, specs or agent instructions |
| `ci`       | changes automated checks or workflows                   |
| `build`    | changes compiling, bundling or packaging                |
| `chore`    | maintenance that fits none of the above                 |

## 2. Shapes

| Object             | Shape                                   | Example                                 |
| ------------------ | --------------------------------------- | --------------------------------------- |
| Branch             | `<type>/<kebab-case-description>`       | `feat/bookmark-search`                  |
| Commit subject     | `<type>(optional-scope): <description>` | `fix(bookmarks): reject duplicate tags` |
| Pull request title | the same as a commit subject            | `feat(bookmarks): add full-text search` |

- The description is imperative, starts lowercase and does not end with a period.
- The scope is a lowercase technical area (`bookmarks`, `web`, `tools`), never a ticket id.
- `!` after the type or scope marks a breaking change: `feat(api)!: remove v1 list endpoint`.
- A commit body is optional and short; details go into the pull request.
- Git's own merge and revert subjects are accepted.

```bash
pnpm validate:conventions --branch 'feat/bookmark-search'
printf '%s' "$subject" | pnpm validate:conventions --commit -
pnpm validate:conventions --title 'feat(bookmarks): add full-text search'
```

## 3. Branches and merging

- Work on a branch, never directly on `master`.
- The repository lives on Gitea (`origin`). Push only to `origin`; the GitHub copy is a push
  mirror that Gitea overwrites, so never push to it or open pull requests there.
- Pull requests are opened, reviewed and merged in Gitea with the [`tea`](https://gitea.com/gitea/tea)
  CLI (`gh` does not work there):

  ```bash
  git push -u origin '<branch>'
  tea pulls create --head '<branch>' --base master --title '<title>' --description-file body.md
  tea pulls merge <number> --style squash --title '<title>'
  ```

  If `tea` cannot match the `origin` remote to a login (an SSH host alias), add
  `--login <name> --repo <owner>/<repo>`.

- Pull requests are squash-merged; the **title becomes the commit on `master`**, so it describes
  the finished change.
- The body follows [`.github/PULL_REQUEST_TEMPLATE.md`](../../.github/PULL_REQUEST_TEMPLATE.md):
  `## TL;DR`, `## Impact`, `## Links`. Do not list the checks you ran; CI shows them.
- Agents may push their branches and merge their own pull requests once CI is green, unless the
  change needs a human gate (constitution principle 8): an unapproved feature spec, a database
  migration, a destructive action or secrets.

## 4. Never

- `git push --no-verify` or `git commit --no-verify` (agents; humans only in emergencies).
- Force-push `master`, or rewrite history someone else has pulled.
- Commit secrets, credentials or `.env` files.
