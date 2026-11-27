# Verify 038 — pocket-comms: Autopilot

- **Inputs:** spec.md, plan.md, tasks.md, ADR 0021, ADRs 0014 and 0018-0020, the constitution,
  `AGENTS.md`, the glossary, the grilling of 2026-11-27 (issue #148).
- **Rounds:** 2. Round 1 found one CRITICAL finding (V01); the owner decided it on 2026-11-27.

## Findings

| Id  | Severity | Where    | Finding                                                                                                                                                                                                                                    | Fix                                                                               |
| --- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| V01 | CRITICAL | spec R17 | Grilling drift: the summary said a mission continues after the usage-limit reset only inside the window, else waits for the owner. Claude Code waits for the reset and carries on by itself; comms cannot hold it without interrupting it. | Asked the owner: Claude carries on by itself; Autopilot sends nothing more (R18). |
| V02 | MEDIUM   | spec R8  | At most 30 issues per planet per window is not in the grilling; it bounds one night's Pi use on a planet with a long backlog.                                                                                                              | Kept; named in the pull request.                                                  |
| V03 | MEDIUM   | spec R19 | The summary is sent only for a window in which Autopilot triaged or sent anything, so a quiet night does not notify.                                                                                                                       | Kept; named in the pull request.                                                  |
| V04 | MEDIUM   | spec R3  | The grilling named the switch, not its default; it is on, because a planet reaches Autopilot only by the owner's choice of the level.                                                                                                      | Kept; named in the pull request.                                                  |
| V05 | LOW      | spec R12 | "Oldest" is the lowest issue number; Gitea's issue list carries no creation time in the app's issue shape, and numbers grow with time.                                                                                                     | None.                                                                             |
| V06 | LOW      | spec R14 | A lost mission can still be resumed; Autopilot labels it `autopilot:skip` anyway, as the grilling said, and the owner may remove the label.                                                                                                | None.                                                                             |
| V07 | LOW      | spec R9  | Every verdict gets a comment, not only **not ready**, so each label Autopilot set has its reason on the issue.                                                                                                                             | None.                                                                             |

## Coverage

| Requirement | Tasks            |
| ----------- | ---------------- |
| R1          | T1, T10, T11     |
| R2          | T1, T8           |
| R3          | T2, T10, T11     |
| R4          | T2, T9           |
| R5          | T9               |
| R6          | T9               |
| R7          | T9               |
| R8          | T3, T9           |
| R9          | T3, T6, T9       |
| R10         | T9               |
| R11         | T4, T9           |
| R12         | T4, T9           |
| R13         | T5, T8, T10, T11 |
| R14         | T4, T6, T9       |
| R15         | T4, T9           |
| R16         | T9               |
| R17         | T5, T6, T7, T8   |
| R18         | T9               |
| R19         | T4, T9           |
| R20         | T10, T11         |
