---
name: flight-plan
description: Write the technical plan (plan.md) for a full-flight spec. The third step of a full flight under the flight rules.
---

# flight-plan — Write the plan

Write `plan.md` next to the spec.

## Rules

- Copy [`plan-template.md`](plan-template.md). Define HOW: affected projects and their tags,
  contract changes, migrations, test strategy and risks.
- Follow the planet's constitution and the nearest `AGENTS.md`: its layers, its shapes, its
  gates.
- An architecture decision the plan depends on needs an ADR in the planet. The grilling settled
  it: write the ADR as `Accepted` and name the grilling. It did not: that is a stop (flight
  rules, section 3).
- A migration is a stop (flight rules, section 3): ask the owner about it when you reach it in
  `flight-implement`, not now, unless it changes the plan.
- The status stays `Draft` until `flight-verify` passes.

Then continue with `flight-tasks`.
