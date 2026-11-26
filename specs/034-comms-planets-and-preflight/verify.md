# Verify 034 — pocket-comms: planets and preflight

`flight-verify` of 2026-11-26 against the grilling of 2026-11-26, constitution 3.0.0, ADR 0016 and
ADR 0018. Two rounds; no CRITICAL or HIGH finding remains.

## Findings

| Id  | Severity | File                  | Finding                                                                                                                                     | Fix                                               |
| --- | -------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| V01 | HIGH     | ADR 0018, Decision    | "The code has no rule that names a repository" contradicts the seed, which leaves out `pocket-cloud` and `pocket-mission`.                  | Fixed: "apart from that one-time seed".           |
| V02 | MEDIUM   | spec, requirement 10  | "About a minute" has no measurable bound.                                                                                                   | Fixed: 60 seconds in spec, plan, tasks and ADR.   |
| V03 | MEDIUM   | spec, section 4       | Requirement 10 (reuse) and 14 (Unregister asks in place) had no acceptance criterion.                                                       | Fixed: two criteria added.                        |
| V04 | MEDIUM   | spec, notes; glossary | The spec says "repository" for what is not a planet, while the glossary lists "repository" under Avoid for Planet.                          | Fixed: the glossary limits the Avoid to a planet. |
| V05 | LOW      | spec, requirement 3   | Closing an issue is limited to planets, which the grilling did not name; it follows from the planet page being the only place to close one. | Kept; said in the pull request.                   |
| V06 | LOW      | spec, requirement 13  | The grilling said "Other repos"; the spec says "Other repositories" (the glossary avoids "repo").                                           | Kept.                                             |

## Coverage

| Requirement | Tasks              |
| ----------- | ------------------ |
| 1           | T03                |
| 2           | T02, T03           |
| 3           | T03, T07           |
| 4           | T02, T04           |
| 5           | T03, T07, T08      |
| 6           | T03, T04, T07, T08 |
| 7           | T02, T05, T06, T07 |
| 8           | T02, T06, T07      |
| 9           | T02, T06, T07      |
| 10          | T06, T07           |
| 11          | T02, T07, T08      |
| 12          | T02, T06, T07      |
| 13          | T08                |
| 14          | T08                |
| 15          | T01                |
