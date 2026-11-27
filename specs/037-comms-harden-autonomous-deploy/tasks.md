# Tasks 037 — harden autonomous deploy

Each task: test first, then the change; `pnpm verify:local` before the commit.

- [x] T1 Domain: states `deploy-lost`/`down`, phase `ci`, `pid`, `resumedAt`; `isDeployFailure`;
      `lastDeploy` over every deploy failure and `resumedAt`; `LastDeployFacts` wording
      (spec 6, 8). Tests in `mission.spec.ts`, `planet.spec.ts`.
- [x] T2 Domain: `PlanetSettings.apps`, `appsSeeded`, `seedAllowedApps`, `allowApps`; the "apps"
      deploy check refuses an app not allowed and lists the named apps (spec 13, 14). Tests.
- [x] T3 Infrastructure: missions file and planets file keep the new fields (compile guard;
      round trip tests).
- [x] T4 Infrastructure: deploy layer `start` returns the pid and fails on a spawn error,
      `running(pid)`, result `down` (spec 1, 3, 4). Tests with a fake script.
- [x] T5 Infrastructure: Gitea `commitStatus`; bot `closeIssue`. Tests against the fake Gitea.
- [x] T6 Application: master CI phase (spec 16, 17). Use case tests: waits while pending, tags
      after success, red ends not-deployed without a pause, 60 minutes.
- [x] T7 Application: deploy lost, down, failed before deploying, spawn failure (spec 1-5). Use
      case tests.
- [x] T8 Application: pause for every failure, fix issue retry, `resumePlanet` (spec 6-8). Use
      case tests.
- [x] T9 Application: the owner's Deploy checks first, goes back to waiting, remove puts it back
      (spec 10-12). Use case tests.
- [x] T10 Application: allowed apps in deploy facts and in `planReleases`, `allowApps`, the seed,
      the preflight reuse keyed by the latest deploy (spec 9, 13, 14). Tests.
- [x] T11 Contract, API: states, `apps` in preflight, resume, apps, Deploy 409; handler tests;
      accepted diff lines.
- [x] T12 Web: state names, Resume, allow apps; client tests.
- [x] T13 Docs: spec 036 pointers, ADR 0020 addendum, mission-control.md.
- [x] T14 pocket-cloud: `deploy.sh` reports `down`; pocket-cloud#90, left open for the owner.
