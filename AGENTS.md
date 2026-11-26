# AGENTS.md

A spec-driven TypeScript monorepo (Effect, Nx, React) built mostly by coding agents under the
flight rules and automated gates.

## Commands

Use pnpm. Run `pnpm install` before the first build.

- `pnpm verify:local` — the fast local checks (also the pre-push hook). CI runs the full set,
  `pnpm verify`, from the shared CI package `@smotastic/pocket-ci` (ADR 0013).
- `pnpm dev` — every app's `dev` target: the API and the web app with hot reload (the service
  has no database). `pnpm start` builds the web app and serves it with the API.
- `pnpm nx sync` and `pnpm format` — after adding or moving projects.
- `pnpm validate:conventions` — branch names, commit subjects and pull request titles.

## Read first

- Load the `flight-rules` skill before every task. It says how agents work on every planet: the
  lanes, when the owner is asked, and the standing rules. Its source is
  `apps/comms-server/skills/`; every agent gets it through the global skills folder (ADR 0016).
- Read [the constitution](.specify/memory/constitution.md) before every task: how code is built
  here. It may make the flight rules stricter, never looser, and wins over every other document
  of this repository.
- Name things with the words of [the glossary](GLOSSARY.md) and never its _Avoid_ words, in docs,
  specs and new code.
- For work below `apps/<app>/`, `packages/<service>/` or `blueprints/<name>/`, read the nearest
  `AGENTS.md`.

## Task guidance

- Features and new behaviour fly the full flight (grilling, spec, plan, tasks, verify); fixes,
  refactors, docs and chores fly the hop. The `flight-*` skills carry each step; see
  [`specs/README.md`](specs/README.md).
- For architecture work, read the [decision records](docs/architecture/adr/README.md).
- For a new service or web app, build from the shapes of the
  [comms service](packages/comms/AGENTS.md) and its apps (`apps/comms-server`, `apps/comms-web`); the
  bookmarks blueprint was removed (TEMPLATE.md step 3). The repository has no generators.
- For web UI, use `@smotastic/pocket-design` (ADR 0009); its source and rules live in
  pocket-factory's `packages/design`. Change the look or add a reusable component there and take
  it here as a catalog bump, never in an app; an app composes kit components (no stylesheets).
- For a web app's routes and server data, use TanStack Router and TanStack Query as the
  comms web app (`apps/comms-web`) does (ADR 0011).
- For imports across layers or services, check [`.dependency-cruiser.cjs`](.dependency-cruiser.cjs)
  and the Nx tags.
- For Effect code, use the [`effect` skill](.agents/skills/effect/SKILL.md).
- For tests, use the [`test-driven-development` skill](.agents/skills/test-driven-development/SKILL.md).
- For source comments, read [the comment conventions](docs/engineering/code-comments.md).
- For reviews (a pull request, a commit range, uncommitted changes, or the per-task gate), use the
  [`code-review` skill](.agents/skills/code-review/SKILL.md).
- For branches, commits and pull requests, use the `flight-ship` skill; the shapes are checked
  by [the conventions](docs/engineering/git-and-pr-conventions.md).
- For the workflow and its gates, read [the workflow details](docs/architecture/workflow-details.md).
- For the flight skills themselves (`flight-rules` and the steps), change them in
  `apps/comms-server/skills/`; they reach the agents with the next deploy.

If guidance conflicts or the task needs an exception, stop and ask the owner.
