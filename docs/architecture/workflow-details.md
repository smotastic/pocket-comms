# Workflow and Repository Details

> Not required reading for every task. The rules are in the
> [constitution](../../.specify/memory/constitution.md); this page explains the layout and the flow.

## Repository layout

```text
<repository>/
├── .specify/
│   ├── memory/constitution.md       # non-negotiable principles
│   └── templates/                   # spec, plan and tasks skeletons
├── .agents/skills/                  # code-review, effect, git-and-pr-conventions, grill-me,
│                                    # test-driven-development, speckit/{specify,plan,tasks,implement,constitution}
├── .github/                         # CI, pull request and issue templates, CODEOWNERS
├── AGENTS.md                        # root agent brief
├── specs/NNN-slug/                  # spec.md, plan.md, tasks.md
├── docs/{architecture,engineering}/ # ADRs, this page, conventions
├── apps/                            # runnable applications: servers, web apps, CLIs
├── packages/
│   ├── <service>/contract/          # the service's HttpApi, shared by server and web
│   ├── <service>/{domain,application,infrastructure,api}/   # one package per layer
│   ├── backend-shared/              # FieldIssue, Problem Details helpers, validation middleware
│   ├── contracts/problem-details/   # the shared error schema
│   └── design/{tokens,ui}/          # DTCG design tokens and the React UI kit, for web apps
├── blueprints/bookmarks/            # the runnable Golden Path (server + web)
├── tools/                           # boundary tests, ports check, OpenAPI gates, conventions, init
├── .dependency-cruiser.cjs
└── nx.json
```

Package names are `@pocket-comms/<name>`; Nx tags are `scope:*` plus `layer:*`, `type:app` or `type:web`
(ADR 0007), and `type:tokens` or `type:ui` for the design system (ADR 0009).

## Delivery workflow

Small changes — fixes, refactors, docs, dependency bumps, tweaks — go straight to a branch, a
test-first change and a pull request.

Features and new behaviour follow the spec workflow:

```text
1. speckit-specify   → spec.md; resolve open questions with the owner
2. speckit-plan      → plan.md
3. Human review      → approve spec + plan together            [HUMAN GATE]
4. speckit-tasks     → tasks.md
5. speckit-implement → each task test-first, code-review per task, one commit per task
6. Pull request      → all CI gates green                       [CI GATE]
7. Merge             → squash; the agent may merge once CI is green
```

Architecture decisions get an ADR (`docs/architecture/adr/`), approved by the owner.

## Per-task review

`speckit-implement` follows RED → GREEN → REFACTOR. Before each task commit it runs the
[`code-review`](../../.agents/skills/code-review/SKILL.md) skill on the task diff, ideally in a
separate agent on a different model. It fixes blocking findings and records follow-ups as tasks.

## Gates

`pnpm verify:local` runs the fast checks on every push (Husky `pre-push`). CI
([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) runs the full set:

- conventions, lint, format, tests, build, test typecheck (`nx affected`);
- architecture: `pnpm dep-cruise`, `pnpm test:boundaries`, `pnpm ports:check`, `pnpm test:ports`;
- contracts: `pnpm openapi:check`, `pnpm openapi:lint`, `pnpm openapi:diff`, `pnpm test:openapi`;
- design system: `pnpm tokens:check`, `pnpm test:tokens` (also in `verify:local`), Stylelint in
  the UI kit's `lint`, and the component catalog build (`ladle-build`);
- dependency policy: `syncpack`, `pnpm dedupe --check`, `nx sync:check`.

A pull request with a database migration also needs the owner's approval (constitution
principle 8); the reviewer checks the migration rules of ADR 0004.
