# Verify 036 — pocket-comms: autonomous deploy

- **Inputs:** spec.md, plan.md, tasks.md, ADR 0020, the constitution, `AGENTS.md`, the glossary,
  the grilling of 2026-11-27.
- **Rounds:** 2. Round 1 found one HIGH (V01), fixed in the spec; round 2 found no CRITICAL or HIGH.

## Findings

| Id | Severity | Where | Finding | Fix |
| -- | -------- | ----- | ------- | --- |
| V01 | HIGH | spec R9 | "a missing run" had no time, so when a release fails was untestable. | Fixed: a run that does not appear within 10 minutes or does not finish within 60 fails the mission (the plan's numbers). |
| V02 | MEDIUM | spec R6 | The grilling named `fix` (patch) and `feat` (minor) only. The spec reads it literally: other types ship nothing, and a merge with none ends **merged, nothing to release**; `perf` counts as a patch as conventional commits do. | Kept; named in the pull request for the owner. |
| V03 | MEDIUM | spec R7 | The grilling stopped on a migration "touched by the merged change"; the spec stops on a migration among every commit the release ships, because the release ships them all. Stricter, never looser. | Kept; named in the pull request. |
| V04 | MEDIUM | spec R4 | The grilling paused a planet after a rollback without saying how the pause ends; the spec ends it when the "fix the failed deploy" issue is closed, a fact preflight can read. | Kept; named in the pull request. |
| V05 | MEDIUM | spec R9 | A failed release workflow pauses the planet like a rolled-back deploy, although the grilling named only the rollback. | Kept: nothing was deployed, but master holds a change that cannot be released; named in the pull request. |
| V06 | LOW | spec R8 | Later merged missions of a planet that waits for the owner also wait; follows from a release shipping every commit since its tag. | None. |

## Coverage

| Requirement | Tasks |
| ----------- | ----- |
| R1 | T01, T13, T15 |
| R2 | T01, T15 |
| R3 | T01, T04, T07 |
| R4 | T03, T07, T09 |
| R5 | T03, T08 |
| R6 | T02, T05, T08 |
| R7 | T02, T05, T08 |
| R8 | T03, T08 |
| R9 | T05, T06, T08 |
| R10 | T08 |
| R11 | T08 |
| R12 | T06, T09 |
| R13 | T04, T14 |
| R14 | T04, T09 |
| R15 | T02, T10, T11, T12 |
| R16 | T10 |
| R17 | T03, T11, T12 |
| R18 | T07, T11, T12 |

Every acceptance criterion has a test in the plan's strategy; the design kit's publish is T08's
published-only release.
