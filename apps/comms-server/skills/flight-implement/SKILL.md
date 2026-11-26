---
name: flight-implement
description: Implement a full flight's tasks, or a hop's single change, test-first with a code review before every commit. The step before flight-ship under the flight rules.
---

# flight-implement — Implement test-first

In a full flight, implement `tasks.md` one task at a time. In a hop, the change is the one task.

## Rules

- Work on a branch, never the default branch. Name it as `flight-ship` says.
- RED → GREEN → REFACTOR, with the planet's test-first skill when it has one
  (`test-driven-development`).
- Follow the planet's constitution and the nearest `AGENTS.md`: layers, contracts, its own
  skills (such as `effect`).
- Before each commit, review the diff with the planet's `code-review` skill, ideally in a
  separate agent on a different model. Fix every blocking finding test-first, record every
  follow-up as a new task (full flight) or in the pull request (hop), answer every question.
- A migration, a secret or a destructive step is a stop (flight rules, section 3).
- In a full flight, tick the task's checkbox (`- [x]`) in the task's own commit.

## Steps, per task

1. Write the failing test and see it fail for the expected reason.
2. Write the smallest change that passes.
3. Run the affected build, typecheck, lint, tests and boundary checks.
4. Refactor while green.
5. Review the diff and act on the findings.
6. Commit.

After the last task, run the planet's local checks (`pnpm verify:local` on factory planets) and
continue with `flight-ship`.
