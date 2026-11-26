# Workflow and Repository Details

> Not required reading for every task. How agents work is the flight rules (the `flight-rules`
> skill, ADR 0016); how code is built here is the
> [constitution](../../.specify/memory/constitution.md). This page explains the layout and the flow.

## Repository layout

```text
<repository>/
├── .specify/memory/constitution.md  # the engineering principles
├── .agents/skills/                  # code-review, effect, test-driven-development,
│                                    # speckit/constitution (the flight-* skills live in
│                                    # apps/comms-server/skills and reach every agent globally)
├── .github/                         # CI, pull request and issue templates, CODEOWNERS
├── AGENTS.md                        # root agent brief
├── specs/NNN-slug/                  # spec.md, plan.md, tasks.md
├── docs/{architecture,engineering}/ # ADRs, this page, conventions
├── apps/                            # runnable applications: servers, web apps, CLIs
├── packages/
│   ├── <service>/contract/          # the service's HttpApi, shared by server and web
│   ├── <service>/{domain,application,infrastructure,api}/   # one package per layer
│   ├── backend-shared/              # FieldIssue, Problem Details helpers, validation middleware
│   └── contracts/problem-details/   # the shared error schema
├── blueprints/                      # runnable references; the bookmarks blueprint was removed
├── tools/                           # template init (the gates: @smotastic/pocket-ci, ADR 0013)
├── .dependency-cruiser.cjs
└── nx.json
```

Package names are `@pocket-comms/<name>`; Nx tags are `scope:*` plus `layer:*`, `type:app` or `type:web`
(ADR 0007). Web apps take their look from the published design package `@smotastic/pocket-design`
(ADR 0009).

## Delivery workflow

Every piece of work flies one of two lanes of the flight rules (ADR 0016). The `flight-*` skills
live in `apps/comms-server/skills` and reach every agent through the global skills folder.

```text
Full flight — features, new behaviour, architecture changes
1. flight-grill     → the owner's grilling; their confirmation approves the work   [OWNER]
2. flight-spec      → spec.md
3. flight-plan      → plan.md, with any ADR the grilling settled
4. flight-tasks     → tasks.md
5. flight-verify    → spec, plan and tasks checked against each other and the rules;
                      CRITICAL and HIGH fixed, then spec and plan set to Approved
6. flight-implement → each task test-first, code-review per task, one commit per task
7. flight-ship      → pull request, all CI gates green, squash merge, deploy  [CI GATE]

Hop — fixes, refactors, docs, dependency bumps, small tweaks
1. flight-implement → the change, test-first, with a code review
2. flight-ship      → pull request, all CI gates green, squash merge, deploy  [CI GATE]
```

The flight rules name the stops where the owner is still asked: a migration, secrets, a
destructive action, an architecture decision the grilling did not settle, a gate that stays red,
and a deploy without a recipe with a health check and a rollback.

## Per-task review

`flight-implement` follows RED → GREEN → REFACTOR with the
[`test-driven-development`](../../.agents/skills/test-driven-development/SKILL.md) skill. Before
each task commit it runs the [`code-review`](../../.agents/skills/code-review/SKILL.md) skill on
the task diff, ideally in a separate coding agent on a different model. It fixes blocking findings
and records follow-ups as tasks.

## Gates

The gates come from the shared CI package `@smotastic/pocket-ci` (ADR 0013), pinned in the
catalog of `pnpm-workspace.yaml`. `pnpm verify:local` runs the fast checks on every push (Husky
`pre-push`). CI ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) runs the full set in
one job, `pnpm verify`, and lists every failed step at the end:

- lint, format, tests, build, test typecheck (`nx affected`);
- architecture: `pnpm dep-cruise`, `pnpm ports:check`;
- contracts: `pnpm openapi:check`, `pnpm openapi:lint`, `pnpm openapi:diff`;
- dependency policy: `syncpack`, `pnpm dedupe --check`, `nx sync:check`;
- the container image of every affected project with a `Dockerfile`.

The self-tests that prove each gate fires live in the package's source repository, pocket-factory.
The tests of this repository's own code stay with that code: the template tests are the
`template` project's. The design package's tokens and components are checked where it is built,
in pocket-factory.

A pull request with a database migration also stops for the owner (a stop of the flight rules);
the reviewer checks the migration rules of ADR 0004.
