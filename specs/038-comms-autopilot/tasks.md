# Tasks 038 — Autopilot

Each task: test first, then the change; `pnpm verify:local` before the commit.

- [x] T1 Domain: autopilot level choosable, `effectiveAutonomy` with deploys (spec 1, 2). Tests in
      `planet.spec.ts`.
- [x] T2 Domain: `autopilot.ts` settings, parsing and `windowOf` (spec 3, 4). Tests incl. a window
      across midnight and the edges.
- [x] T3 Domain: triage selection, hash, named-by-pull-request, comment (spec 8, 9). Tests.
- [x] T4 Domain: sendable hops, `pickHop`, breaker, night summary (spec 11, 12, 14, 15, 19). Tests.
- [x] T5 Domain: `Mission.autopilot`, `limitedUntil`, `missionStep` waiting on the limit (spec 13,
      17). Tests in `mission.spec.ts`.
- [x] T6 Infrastructure: autopilot file store, missions file fields (compile guards, round trips);
      usage-limits reader; bot `relabel`; generated mission settings with the status line. Tests.
- [x] T7 Server: `statusline.sh` (a test runs it with sample JSON).
- [x] T8 Application: missions `send` with `autopilot`, the usage limit in the loop; planets
      `choose` and the cap. Use case tests.
- [x] T9 Application: the autopilot use case: window and switch, triage once per window with a
      scripted Pi, labels and comments, skip on Pi missing, sending order and budget, queue
      empty, skip label and breaker, usage-limit stop, the summary once (spec 4-19). Tests.
- [x] T10 Contract and API: `/autopilot`, `/autopilot/settings`, `Mission.autopilot`, autopilot
      choosable; handler tests; accepted diff lines.
- [x] T11 Web: the level on the planet page, the Autopilot section, the mark. Client tests.
- [x] T12 Docs: ADR 0021, glossary, mission-control.md, spec pointers.
