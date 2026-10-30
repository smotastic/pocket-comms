---
name: speckit-tasks
description: Break an approved plan into atomic, testable checkbox tasks (tasks.md).
---

# speckit-tasks — Break a plan into tasks

Write `tasks.md` for an approved `plan.md`.

## Rules

- The human owner must have approved spec and plan.
- Use `.specify/templates/tasks-template.md`. Each task is a checkbox item
  (`- [ ] **T01** — …`), numbered and ordered, with a gate that proves it.
- Make tasks atomic and independently testable. Prefer vertical slices; use a contract-only or
  infrastructure-only task when slicing makes no sense.
- No artificial task-count limit.

## Steps

1. Read the approved plan.
2. Split the work into small, testable tasks.
3. Save `tasks.md` and continue with `speckit-implement`, one task at a time.
