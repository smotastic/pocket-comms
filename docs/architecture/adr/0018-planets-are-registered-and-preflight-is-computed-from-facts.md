# ADR 0018 — Planets are registered, and preflight is computed from facts

- **Status:** Accepted
- **Date:** 2026-11-26
- **Related:** ADR 0016; spec 034; [the vision](../../mission-control.md)
- **Approved by:** the owner's grilling of 2026-11-26 (flight rules, section 2)

## TL;DR

A planet is a repository the owner registered, kept with its settings in `planets.json` in the
server's state folder and seeded once from the repositories below the projects root. Whether a
planet is ready for missions is **preflight**: a fixed checklist computed from facts on Gitea when
it is asked for, never stored and never an agent's judgement. The autonomy level the owner chose
is stored; the level in effect is computed from it and preflight every time.

## Context

Mission Control will send issues on missions that an agent carries out alone (ADR 0016). Until
now every git repository below the projects root was a "project", with no settings, and nothing
said whether a repository could referee an agent's work: CI, a green default branch, a known
verify command. pocket-cloud, which deploys everything, sits below the same root and must never
receive a mission.

## Decision

- **Opt-in registry.** A repository becomes a planet only when the owner registers it. The
  registry and each planet's settings live in `planets.json` in the state folder, as the other
  owner settings do; there is no database. On the first start without the file, the server
  registers every repository whose `origin` is on the app's Gitea, except `pocket-cloud` and
  `pocket-mission`; afterwards only the file decides: apart from that one-time seed, no rule in the code
  names a repository. Unregistering stops nothing: the planet's workspaces fall under Other.
- **Preflight from facts.** Five checks, read from the planet's default branch and its CI runs on
  Gitea: the repository is on Gitea, `AGENTS.md`, a CI workflow, the newest finished push run
  green (cancelled and skipped runs do not count), a `verify` script. Go only when all pass.
  Computed on request and reused for 60 seconds; no background loop. Later steps add checks
  (the bot identity and dev ports for missions, a deploy recipe with health check and rollback
  for deploys); none is ever a judgement.
- **Autonomy: chosen versus effective.** The chosen level is stored per planet; the effective
  level is computed on every read as the chosen level, lowered to manual on no-go. Preflight
  never raises it. Sending a mission (step 3) computes preflight again without reuse.

## Consequences

- A new repository below the root is not worked on until the owner registers it, including by
  the brainstorm.
- Preflight trusts the CI result on Gitea rather than running verify itself: cheap, and the same
  referee the merge uses, but a flaky CI shows as no-go until a later run passes.
- Readiness cannot drift from the facts, because it is never stored; the cost is a handful of
  Gitea reads per planet per minute while the owner looks.

## Alternatives considered

- **Every repository is a planet, with exclusions:** pocket-cloud would be one by default; a
  missed exclusion means a mission on the deploy repository.
- **Readiness as a setting the owner flips:** drifts from reality the first time CI goes red.
- **Run verify in Pocket Comms:** slow, heavy on the build machine, and a second referee besides
  CI.
