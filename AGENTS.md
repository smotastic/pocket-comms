# AGENTS.md

A spec-driven TypeScript monorepo (Effect, Nx, React) built mostly by coding agents under
human-approved specs and automated gates.

## Commands

Use pnpm. Run `pnpm install` before the first build.

- `pnpm verify:local` — the fast local checks (also the pre-push hook). CI runs the full set.
- `pnpm dev` — every app's `dev` target: database, migrations, example data, API and web app.
  `pnpm dev:memory` runs without Docker; `pnpm dev:down` stops the database, `pnpm dev:reset`
  wipes it.
- `pnpm nx sync` and `pnpm format` — after adding or moving projects.
- `pnpm validate:conventions` — branch names, commit subjects and pull request titles.

## Read first

- Read [the constitution](.specify/memory/constitution.md) before every task. It wins over every
  other document.
- Use English for all repository artifacts.
- For work below `apps/<app>/`, `packages/<service>/` or `blueprints/<name>/`, read the nearest
  `AGENTS.md`.

## Task guidance

- Features and new behaviour need a spec first; fixes, refactors, docs and chores do not. See
  [`specs/README.md`](specs/README.md) and the [Spec Kit skills](.agents/skills/speckit/).
- For architecture work, read the [decision records](docs/architecture/adr/README.md).
- For a new service or web app, build from the shapes of the
  [bookmarks blueprint](blueprints/bookmarks/AGENTS.md); it is the Golden Path, a reference rather
  than a copy source. The repository has no generators.
- For web UI, use `@pocket-comms/design-ui`; change the look in the
  [design system](packages/design/AGENTS.md), never in an app.
- For a web app's routes and server data, use TanStack Router and TanStack Query as the
  [bookmarks web app](blueprints/bookmarks/AGENTS.md) does (ADR 0011).
- For imports across layers or services, check [`.dependency-cruiser.cjs`](.dependency-cruiser.cjs)
  and the Nx tags.
- For Effect code, use the [`effect` skill](.agents/skills/effect/SKILL.md).
- For tests, use the [`test-driven-development` skill](.agents/skills/test-driven-development/SKILL.md).
- For source comments, read [the comment conventions](docs/engineering/code-comments.md).
- For reviews (a pull request, a commit range, uncommitted changes, or the per-task gate), use the
  [`code-review` skill](.agents/skills/code-review/SKILL.md).
- For branches, commits and pull requests, use the
  [`git-and-pr-conventions` skill](.agents/skills/git-and-pr-conventions/SKILL.md).
- For the workflow and its gates, read [the workflow details](docs/architecture/workflow-details.md).
- Before any non-trivial task, run the [`grill-me` skill](.agents/skills/grill-me/SKILL.md).

If guidance conflicts or the task needs an exception, stop and ask the human owner.
