---
name: flight-tasks
description: Break a full-flight plan into atomic, testable checkbox tasks (tasks.md). The fourth step of a full flight under the flight rules.
---

# flight-tasks — Break the plan into tasks

Write `tasks.md` next to the plan.

## Rules

- Copy [`tasks-template.md`](tasks-template.md). Each task is a checkbox item
  (`- [ ] **T01** — …`), numbered and ordered, with a gate that proves it.
- Name the requirements each task serves (`FR-3`, or the spec's numbering), so `flight-verify`
  can trace them.
- Make tasks atomic and independently testable. Prefer vertical slices; use a contract-only or
  infrastructure-only task when slicing makes no sense.
- No artificial task-count limit.

Then continue with `flight-verify`.
