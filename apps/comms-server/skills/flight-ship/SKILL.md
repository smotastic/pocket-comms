---
name: flight-ship
description: Name branches, commits and pull requests, open the pull request, see CI green, merge, and deploy where the planet allows it. The last step of both lanes under the flight rules; use it before creating a branch, before every commit and before opening a pull request.
---

# flight-ship — Ship it

## Names

| Object             | Shape                                   | Example                                 |
| ------------------ | --------------------------------------- | --------------------------------------- |
| Branch             | `<type>/<kebab-case-description>`       | `feat/bookmark-search`                  |
| Commit subject     | `<type>(optional-scope): <description>` | `fix(bookmarks): reject duplicate tags` |
| Pull request title | the same as a commit subject            | `feat(bookmarks): add full-text search` |

Types: `feat` (behaviour a user or caller can observe) · `fix` · `refactor` · `test` · `docs`
(documentation, specs, agent instructions) · `ci` · `build` · `chore`.

- The description is imperative, starts lowercase and has no trailing period. The scope is a
  lowercase technical area, never an issue number. `!` after type or scope marks a breaking change.
- If one diff does two things, make two commits.
- Validate before the object exists, when the planet has the validator:

  ```bash
  pnpm validate:conventions --branch '<name>'
  printf '%s' "$subject" | pnpm validate:conventions --commit -
  pnpm validate:conventions --title '<title>'
  ```

## Pull request

1. Push only to `origin` (Gitea; a GitHub copy is a mirror). Never `--no-verify`.
2. Open it with `tea` (`gh` does not work on Gitea); add `--login <name> --repo <owner>/<repo>`
   when `tea` matches no login:

   ```bash
   tea pulls create --head '<branch>' --base master --title '<title>' --description-file body.md
   ```

   The body has `## TL;DR`, `## Impact` (migrations, breaking changes, risks, follow-ups, the
   MEDIUM and LOW findings of `verify.md`) and `## Links` (spec, ADR, issue; `Closes #N` on a
   mission). Do not list the checks you ran.

3. Attach it to your conversation with the `comms-attach-pull-request` skill.
4. In a full flight, set the spec's status to `Done` in the pull request.

## CI and merge

- Wait for CI. When it is red, fix the cause test-first and push again; after three failed
  attempts, stop (flight rules, section 3).
- When CI is green and no stop of the flight rules is open, squash-merge. The title becomes the
  commit on the default branch:

  ```bash
  tea pulls merge <number> --style squash --title '<title>'
  ```

- A branch behind the default branch is updated by merging the default branch into it, never by
  force-pushing a rebase that someone else may have pulled.

## Deploy

Deploy only when the planet's `AGENTS.md` names a deploy recipe with a health check and a
rollback. Then follow it after the merge: deploy, run the health check, and roll back if it
fails; a rollback is reported to the owner. Without such a recipe, the flight ends at the merge:
tell the owner what merged and that the deploy is theirs.
