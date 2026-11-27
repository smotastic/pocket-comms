# Verify 035 — pocket-comms: missions to merge

`flight-verify` of 2026-11-27 against the grilling of 2026-11-27, constitution 3.0.0, ADR 0016,
ADR 0018 and ADR 0019. Two rounds; no CRITICAL or HIGH finding remains.

## Findings

| Id  | Severity | File                 | Finding                                                                                                                                                                                                                       | Fix                                                                                          |
| --- | -------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| V01 | MEDIUM   | spec, all sections   | "The queue" unqualified; the glossary avoids "queue (unqualified)".                                                                                                                                                           | Fixed: "mission queue" throughout.                                                           |
| V02 | MEDIUM   | spec, requirement 24 | The grilling named the log's finished missions as merged, failed and aborted; the spec adds **held**. A held mission leaves the queue and the grilling gives it no other place, while the owner must see it to send it again. | Kept; said in the pull request for the owner.                                                |
| V03 | MEDIUM   | spec, requirement 20 | The grilling did not say what a pull request closed without merging does. Without a rule the mission would stay in **pull request** for good.                                                                                 | Kept as a failure (the failure path the grilling settled); said in the pull request.         |
| V04 | LOW      | spec, requirement 17 | An agent that ends without a pull request or an outcome stays **working** until the owner aborts it.                                                                                                                          | Kept: the owner sees it on the Mission Control screen.                                       |
| V05 | LOW      | plan, risks          | A planet without the bot setup turns no-go after the deploy, a visible change of step 2's result.                                                                                                                             | Kept: it is what the grilling's sixth check means; the setup steps go with the pull request. |

## Coverage

| Requirement | Tasks                                          |
| ----------- | ---------------------------------------------- |
| 1           | T01, T05, T07, T11                             |
| 2           | T01, T05                                       |
| 3           | T03, T05, T06                                  |
| 4           | T03, T06, T10, T13                             |
| 5           | T02, T07, T10, T13                             |
| 6           | T02, T07, T10, T13                             |
| 7           | T02, T05, T07                                  |
| 8           | T14                                            |
| 9           | T01, T04, T07                                  |
| 10          | T01, T02, T07, T08                             |
| 11          | T02, T07, T10                                  |
| 12          | T02, T08                                       |
| 13          | T05, T08                                       |
| 14          | T01, T04, T08, T11                             |
| 15          | T02, T08, T11                                  |
| 16          | T05, T08, T10, T13                             |
| 17          | T02, T08                                       |
| 18          | T08 (no change: the existing answer path)      |
| 19          | T02, T08                                       |
| 20          | T02, T09, T10, T11                             |
| 21          | T02, T05, T09, T10                             |
| 22          | T02, T04, T09, T10                             |
| 23          | T08 (no change: nothing starts while one runs) |
| 24          | T02, T07, T10, T12                             |
| 25          | T02, T07, T10, T12                             |
| 26          | T10, T12                                       |

Every acceptance criterion maps to a test in the plan's strategy: the send refusals, the queue
order and held, the start, waiting, merged with cleanup, abort and resend, lost and resume, the
overnight log and seen, the brainstorm's lane, and the 90 days.
