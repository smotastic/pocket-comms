# Specifications

A spec says **what** a feature does and **why**; its plan says **how**; its tasks split the work.
The spec is the prompt, and the code must satisfy it.

## When you need one

| Change                                                       | Needs                              |
| ------------------------------------------------------------ | ---------------------------------- |
| A feature or new behaviour a user or caller can observe      | `spec.md` + `plan.md` + `tasks.md` |
| An architecture decision (stack, layering, a new rule)       | An ADR in `docs/architecture/adr/` |
| A fix, refactor, docs change, dependency bump or small tweak | Nothing — a conventional commit    |

Features fly the full flight of the flight rules; the rest flies the hop. When in doubt, ask the
owner.

## Layout

```text
specs/
└── NNN-kebab-slug/
    ├── spec.md    WHAT and WHY      (template of the flight-spec skill)
    ├── plan.md    HOW               (template of the flight-plan skill)
    ├── tasks.md   checkbox tasks    (template of the flight-tasks skill)
    └── verify.md  the flight-verify findings
```

`NNN` is a global, sequential 3-digit number: take the highest existing one and add 1. Copy the
templates by hand; there is no generator.

## Workflow

1. `flight-grill` grills the owner; their confirmation of the summary approves the work.
2. `flight-spec` writes `spec.md` from the grilling.
3. `flight-plan` writes `plan.md`.
4. `flight-tasks` writes `tasks.md`.
5. `flight-verify` checks spec, plan and tasks against each other and the rules, fixes what it
   finds and sets spec and plan to `Approved`.
6. `flight-implement` implements one task at a time, test-first, with the `code-review` skill
   before each commit.
7. `flight-ship` opens the pull request; CI proves the result.

A spec's status line moves from `Draft` to `Approved` to `Done`. Specs written before ADR 0016
were approved by the owner directly. A later change to the same
feature gets a new spec that names the one it changes.

The example is [`004-pocket-comms-v1`](004-pocket-comms-v1/spec.md).
