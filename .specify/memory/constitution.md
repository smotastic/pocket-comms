# Engineering Constitution

<!--
Sync impact report (kept by the speckit-constitution skill):
- Version: 1.1.0 → 2.0.0 (2026-10-19, approved by the human owner)
- MAJOR: rewritten as a short, generic ruleset for small projects. Removed the multi-service
  rules (owning service, database per service, extraction reasons, products as configurations,
  external standards at the gateway, you build it you run it), the layer levels for regional variants,
  and event-first communication. Spec-first is now tiered. Ten principles instead of sixteen.
- Guidance updated: AGENTS.md, README.md, TEMPLATE.md, docs/, specs/README.md,
  .specify/templates/, every skill in .agents/skills/, ADRs 0001 to 0008.
- Previous: 1.1.0 (2026-09-29)
-->

> The non-negotiable engineering principles of this repository. Every agent reads this file
> before any task. Conflicts are resolved in favour of this constitution. Changes go through the
> `speckit-constitution` skill and need human approval.

## Principles

### Architecture

1. **Hexagonal layers, machine-enforced.** Every backend service has `domain → application →
infrastructure`. The domain knows nothing about infrastructure, frameworks or the database.
   Dependency-cruiser, the Nx module boundaries and the ports check enforce the direction.
2. **Business logic lives in the domain, never in the database.** The database stores data and
   protects its integrity; it holds no business rules.
3. **Contracts first.** Every API is declared once as an Effect `HttpApi` in a contract package.
   The server, the typed clients and the OpenAPI document come from that declaration.

### Workflow

4. **Spec-first for features, not for chores.** New behaviour and architecture changes need an
   approved `spec.md` + `plan.md` + `tasks.md` under `specs/NNN-slug/`. Fixes, refactors, docs,
   dependency bumps and small tweaks need only a good commit. Architecture decisions are ADRs.
5. **CI is the referee, not trust.** An agent does not _claim_ something works; the gates prove
   it.
6. **Deterministic before generative.** Boilerplate comes from the runnable blueprint in
   `blueprints/` and the templates in `.specify/templates/`; only logic comes from the agent.
7. **Small, tested, shippable changes.** Every change is small, test-first and leaves `master`
   releasable.

### Guardrails

8. **Human-in-the-loop** is mandatory for: approving a feature spec and plan, database schema
   changes, destructive or irreversible actions (data deletion, force-pushes, releases), and
   anything that touches secrets or credentials.
9. **Agents never bypass guardrails.** Layer boundaries, contracts and gates are not suggestions.
   An agent that wants to cross one stops and asks the human owner.
10. **Proper solutions over workarounds.** No bypass flags, special cases, ad-hoc error shapes or
    one-off escape hatches. If the clean solution is blocked, stop and escalate. An accepted
    deviation is a human decision, documented in an ADR (architecture) or a spec note (otherwise),
    with a reason and, if temporary, a removal path.

All repository artifacts are in English.

## The three sentences every agent must internalize

1. Business logic belongs in the domain layer, never in the database or the HTTP handler.
2. The contract comes first; the code satisfies it.
3. Every change is small, tested and proven by CI.
