# pocket-comms

A template for **spec-driven TypeScript projects built by coding agents** — an "AI dark
factory" at small scale. Humans define intent, specs and architecture guardrails; agents write the
code; automated gates judge it.

> **The specification is the truth, and the code must satisfy it.**

What you get:

- **A ruleset for agents:** a short [constitution](.specify/memory/constitution.md), an
  [`AGENTS.md`](AGENTS.md) entry point and skills for specs, test-first work, code review and Git.
- **Tiered spec-first workflow:** features get a spec, plan and tasks with one human approval;
  fixes and chores just get a good commit. Architecture decisions are [ADRs](docs/architecture/adr/README.md).
- **A stack with guardrails:** [Effect](https://effect.website/) 4 backends in hexagonal layers,
  PostgreSQL, REST APIs with generated OpenAPI, React + Vite web apps with TanStack Router, TanStack
  Query, a typed API client and a design system (DTCG tokens and a React UI kit), an Nx monorepo on pnpm.
- **Machine-enforced architecture:** dependency-cruiser and Nx module boundaries, a ports check,
  OpenAPI lint and breaking-change gates, design-token and token-only stylesheet checks, commit
  conventions — locally on pre-push and in CI.
- **A runnable Golden Path:** the [bookmarks blueprint](blueprints/bookmarks/AGENTS.md), a small
  fullstack app that shows every layer, test and gate once.

## Quick start

Requires Node.js 26+, pnpm 11+ and Docker (for the database tests).

```bash
pnpm install
pnpm template:init --repo <owner>/<name> --scope @<scope>   # rename the @pocket-comms placeholders
pnpm format
pnpm verify:local
```

Then work through [`TEMPLATE.md`](TEMPLATE.md).

Run the blueprint, with example data:

```bash
pnpm dev          # PostgreSQL, migrations, seed, API on :3001 (docs at /docs), web app on :4200
pnpm dev:memory   # the same without Docker; the data lives in the API process
pnpm dev:down     # stop PostgreSQL and keep its data; pnpm dev:reset wipes it
```

## Structure

```text
.specify/            constitution and spec/plan/tasks templates
.agents/skills/      agent skills: speckit, code-review, git conventions, TDD, grill-me, effect
specs/               feature specs: specs/NNN-slug/{spec,plan,tasks}.md
docs/                ADRs, the workflow, engineering conventions
apps/                your applications
packages/            your libraries, plus backend-shared, the Problem Details contract and the
                     design system (packages/design: tokens and UI kit)
blueprints/          the runnable reference app (delete when not needed)
tools/               boundary tests, ports check, OpenAPI gates, design-token check, conventions,
                     template init
```

## Working in it

- Work on a branch (`<type>/<kebab-case>`), never on `master`. See the
  [Git conventions](docs/engineering/git-and-pr-conventions.md).
- After `pnpm install`, a Husky `pre-push` hook runs `pnpm verify:local`. Agents never use
  `--no-verify`.
- The [workflow details](docs/architecture/workflow-details.md) explain the flow and every gate.

## License

[MIT](LICENSE)
