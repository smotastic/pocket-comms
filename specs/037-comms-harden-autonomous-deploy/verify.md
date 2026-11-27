# Verify 037 — pocket-comms: harden autonomous deploy

- **Inputs:** spec.md, plan.md, tasks.md, ADR 0020 and its addendum, the constitution,
  `AGENTS.md`, the glossary, the grilling of 2026-11-27 (issue #145).
- **Rounds:** 1. No CRITICAL or HIGH finding.

## Findings

| Id  | Severity | Where         | Finding                                                                                                                                                                                                        | Fix                                                    |
| --- | -------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| V01 | MEDIUM   | spec R5       | The grilling named **down** for a failed rollback only. The deploy script also reports `failed` when it fails before deploying (a failed backup); the spec ends that as a failed release, which pauses (R6).   | Kept; named in the pull request.                       |
| V02 | MEDIUM   | spec R9       | Showing a new pause or a Resume in preflight at once is not in the grilling; without it Resume would look broken for up to 60 seconds.                                                                         | Kept; named in the pull request.                       |
| V03 | MEDIUM   | spec R12      | Removing a queued Deploy puts it back to waiting instead of deleting it: "never lose it" (decision 4) applied to the owner's own remove.                                                                       | Kept; named in the pull request.                       |
| V04 | MEDIUM   | spec notes    | **down** needs the deploy script to tell a failed rollback from a failure before deploying: a one-line pocket-cloud change, left open for the owner. Until it merges, a failed rollback reports `failed` (R5). | pocket-cloud pull request; named in this pull request. |
| V05 | LOW      | spec R1, plan | "process" is an _Avoid_ word for an **agent**; here it names the deploy script's operating-system process, not an agent.                                                                                       | None.                                                  |
| V07 | MEDIUM   | spec R11, R17 | Found while implementing: an owner's Deploy whose master CI failed would end **merged, not deployed** and lose the Deploy. It now waits for the owner again, as decision 4 ("never lose it") says.             | Fixed in the spec; named in the pull request.          |
| V06 | LOW      | spec R8       | **Resume** of a planet and Resume of a lost mission share a word for different objects; the buttons sit on different screens.                                                                                  | None.                                                  |

## Coverage

| Requirement | Tasks            |
| ----------- | ---------------- |
| R1          | T1, T4, T7       |
| R2          | T1, T7           |
| R3          | T4, T7           |
| R4          | T1, T4, T7, T14  |
| R5          | T7               |
| R6          | T1, T8           |
| R7          | T8               |
| R8          | T5, T8, T11, T12 |
| R9          | T10              |
| R10         | T9, T11          |
| R11         | T9               |
| R12         | T9               |
| R13         | T2, T3, T10      |
| R14         | T2, T10          |
| R15         | T2, T11, T12     |
| R16         | T5, T6           |
| R17         | T6               |
| R18         | T1, T11, T12     |
