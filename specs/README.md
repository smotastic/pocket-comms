# Specifications

A spec says **what** a feature does and **why**; its plan says **how**; its tasks split the work.
The spec is the prompt, and the code must satisfy it.

## When you need one

| Change                                                       | Needs                              |
| ------------------------------------------------------------ | ---------------------------------- |
| A feature or new behaviour a user or caller can observe      | `spec.md` + `plan.md` + `tasks.md` |
| An architecture decision (stack, layering, a new rule)       | An ADR in `docs/architecture/adr/` |
| A fix, refactor, docs change, dependency bump or small tweak | Nothing — a conventional commit    |

When in doubt, ask the human owner.

## Layout

```text
specs/
└── NNN-kebab-slug/
    ├── spec.md    WHAT and WHY      (from .specify/templates/spec-template.md)
    ├── plan.md    HOW               (from .specify/templates/plan-template.md)
    └── tasks.md   checkbox tasks    (from .specify/templates/tasks-template.md)
```

`NNN` is a global, sequential 3-digit number: take the highest existing one and add 1. Copy the
templates by hand; there is no generator.

## Workflow

1. `speckit-specify` writes `spec.md` and resolves open questions with the human owner.
2. `speckit-plan` writes `plan.md`.
3. **Human gate:** the owner approves spec and plan together.
4. `speckit-tasks` writes `tasks.md`.
5. `speckit-implement` implements one task at a time, test-first, with the `code-review` skill
   before each commit.
6. CI proves the result.

A spec's status line moves from `Draft` to `Approved` to `Done`. A later change to the same
feature gets a new spec that names the one it changes.

The example is [`001-bookmarks-blueprint`](001-bookmarks-blueprint/spec.md).
