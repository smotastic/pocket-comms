# Engineering Constitution

<!--
Sync impact report (kept by the speckit-constitution skill):
- Version: 2.0.0 → 3.0.0 (2026-11-26, approved by the human owner through ADR 0016)
- MAJOR: the process moves out. How agents work (lanes, approvals, the owner's stops, CI as the
  referee, no bypassing, proper solutions, English) is now the flight rules, the `flight-rules`
  skill in `apps/comms-server/skills`. Removed principles 4 (spec-first), 5 (CI is the referee),
  7 (small changes), 8 (human-in-the-loop), 9 (never bypass guardrails), 10 (proper solutions) and
  the English line. Kept and renumbered: 1 hexagonal layers, 2 no logic in the database,
  3 contracts first, 4 deterministic before generative (was 6), whose shapes are now the comms
  service's and whose templates are the flight skills'. Mirrors pocket-factory 3.0.0.
- Guidance updated: AGENTS.md, README.md, TEMPLATE.md, docs/, specs/README.md, .agents/skills/
  (grill-me, git-and-pr-conventions and speckit specify, plan, tasks and implement removed),
  .specify/templates/ removed, .github/, ADR 0017.
- Previous: 2.0.0 (2026-10-19, approved by the human owner)
- MAJOR (2.0.0): rewritten as a short, generic ruleset for small projects. Removed the multi-service
  rules (owning service, database per service, extraction reasons, products as configurations,
  external standards at the gateway, you build it you run it), the layer levels for regional variants,
  and event-first communication. Spec-first is now tiered. Ten principles instead of sixteen.
- Guidance updated: AGENTS.md, README.md, TEMPLATE.md, docs/, specs/README.md,
  .specify/templates/, every skill in .agents/skills/, ADRs 0001 to 0008.
- Previous: 1.1.0 (2026-09-29)
-->

> The engineering principles of this repository: how code is built here. How agents work (the
> lanes, the owner's grilling as the approval, the stops where the owner is asked, CI as the
> referee, no bypassing guardrails, proper solutions, English artifacts) is the **flight rules**,
> the `flight-rules` skill every agent loads before any task (ADR 0016). The flight rules are the
> floor: this constitution may make them stricter, never looser. Changes to this file go through
> the `speckit-constitution` skill and need the owner's approval.

## Principles

### Architecture

1. **Hexagonal layers, machine-enforced.** Every backend service has `domain → application →
infrastructure`. The domain knows nothing about infrastructure, frameworks or the database.
   Dependency-cruiser, the Nx module boundaries and the ports check enforce the direction.
2. **Business logic lives in the domain, never in the database.** The database stores data and
   protects its integrity; it holds no business rules.
3. **Contracts first.** Every API is declared once as an Effect `HttpApi` in a contract package.
   The server, the typed clients and the OpenAPI document come from that declaration.

### Building

4. **Deterministic before generative.** Structure follows the shapes of the comms service
   (`packages/comms/`) and its apps, and the spec, plan and tasks templates of the flight skills
   (`flight-spec`, `flight-plan`, `flight-tasks`); only logic comes from the agent.

## The three sentences every agent must internalize

1. Business logic belongs in the domain layer, never in the database or the HTTP handler.
2. The contract comes first; the code satisfies it.
3. Every change is small, tested and proven by CI.
