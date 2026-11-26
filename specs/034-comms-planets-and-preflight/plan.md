# Plan 034 — pocket-comms: planets and preflight

- **Spec:** [spec.md](./spec.md)
- **Status:** `Done` — grilling of 2026-11-26, verified; built in #117 and the pull request of `feat/planets-and-preflight`
- **Decision:** [ADR 0018](../../docs/architecture/adr/0018-planets-are-registered-and-preflight-is-computed-from-facts.md),
  written from the grilling of 2026-11-26

Two pull requests, so each stays reviewable:

1. **The rename** (`refactor(comms)!`): project becomes planet in every layer, the API and the web
   app, with no change in behaviour; every repository below the root is still a planet. It also
   carries this spec, plan, tasks, ADR 0018 and the vision doc's step 3 line.
2. **The registry and preflight** (`feat(comms)`): requirements 1–14.

## 1. Affected projects

| Path                               | Change                                                                                                                                                                                                                                                                                                  | Tags                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `packages/comms/domain`            | `task.ts`: `Project` → `Repository` (a git repository below the root), `orderProjects` → `orderPlanets`. New `planet.ts`: the registry's rules (seed choice, register, unregister, which workspaces are planets) and preflight's rules (`preflightOf(facts)`, the CI run choice, the effective level).  | `layer:domain`         |
| `packages/comms/application`       | `ProjectsOutbound` → `RepositoriesOutbound`; new `PlanetsOutbound` (the registry file); `GiteaOutbound` gains `repository`, `fileText`, `folderNames` and `pushRuns`; `PlanetsInbound` (list, register, unregister, preflight reused for 60 seconds, seed); the agents' load maps non-planets to Other. | `layer:application`    |
| `packages/comms/infrastructure`    | `projects/` → `repositories/`; new `planets/` file store (`planets.json`); Gitea HTTP gains the four reads.                                                                                                                                                                                             | `layer:infrastructure` |
| `packages/comms/contract`          | `/projects` → `/planets`, every `project` field and param → `planet`; new endpoints below.                                                                                                                                                                                                              | `layer:contract`       |
| `packages/comms/api`               | Handlers for the planets group; problems renamed.                                                                                                                                                                                                                                                       | `layer:api`            |
| `apps/comms-server`                | Composition wires the planets store and runs the seed when the layer starts; `projectsRoot` → `repositoriesRoot` in code, the env var `COMMS_PROJECTS_ROOT` stays.                                                                                                                                      | `type:app`             |
| `apps/comms-web`                   | Routes `/planets/$planet`; `ProjectsSheet` → `PlanetsSheet` with go/no-go tags and **Other repositories**; `ProjectPage` → `PlanetPage` with the **Preflight** card.                                                                                                                                    | `type:app`             |
| `docs`, `GLOSSARY.md`, `AGENTS.md` | ADR 0018; vision doc step 3; `packages/comms/AGENTS.md` (planets file, preflight rules row).                                                                                                                                                                                                            | —                      |

## 2. Contract changes

Breaking, on purpose (grilling): only comms-web calls the API. Each line `openapi:diff` reports
goes into `.pocket-ci/openapi-accepted-changes.txt`, taken with `OPENAPI_BASE_REF=origin/master`.

- Renamed: `GET /planets` (was `/projects`), `/planets/:planet/issues…` (was
  `/projects/:project/issues…`), `start-agent` likewise; the fields `project` → `planet` on the
  agent, the new task request, issue proposals; problems `ProjectNotFound` → `PlanetNotFound`.
- `GET /planets` answers `{ planets: Planet[], others: string[] }`: `others` are the repositories
  below the root that are not planets, by name.
- `POST /planets` `{ name }`: registers; `201` with the planet, `404 RepositoryNotFound` when no
  repository below the root has that name, `409 PlanetExists` when it is a planet already.
- `DELETE /planets/:planet`: unregisters; `204`, or `404 PlanetNotFound`.
- `GET /planets/:planet/preflight`: `{ result: 'go' | 'no-go', checks: Check[], autonomy:
{ chosen, effective }, checkedAt }`, a `Check` being `{ check: 'gitea' | 'agents-md' |
'ci-workflow' | 'ci-green' | 'verify-script', passed: boolean, reason: string }`; `404
PlanetNotFound`. Gitea being down is a no-go answer, never an error.

## 3. Migrations

None: no database. `planets.json` is new; its absence triggers the one-time seed (spec,
requirement 2).

## 4. Test strategy

- Unit (domain): `preflightOf` for every check's pass and fail, the Gitea-down cascade, the CI run
  choice (cancelled and skipped skipped, running shown, none finished fails), the effective level,
  the seed choice (Gitea origin, the two names left out) and `planetWorkspaces` mapping
  non-planets to Other.
- Unit (application, fakes): seed runs only without a registry; register/unregister errors;
  creating a task, implementing or closing an issue of a non-planet answers `PlanetNotFound`;
  preflight is reused within 60 seconds and computed again after; the overview puts an unregistered
  repository's agent in Other.
- Infrastructure: the planets file store as the quick-replies store is tested; the four Gitea reads
  against the existing fake Gitea server, 404 as none.
- API: `comms-api.spec.ts` for the new endpoints and their problems.
- Web: `planets-sheet.spec.tsx` (tags, Other repositories, Register) and `planet-page.spec.tsx`
  (Preflight card, the levels shown as coming, Unregister asks in place).
- Boundaries: dependency-cruiser and the Nx tags as they are; the domain stays free of I/O.

## 5. Risks

- **A large rename** hides behaviour changes: the rename PR changes no behaviour and its tests
  only change words, so review can read it as such.
- **Gitea load:** the sheet asks preflight of every planet (about ten calls each); the 60-second
  reuse keeps it small.
- **Gitea's Actions runs API** (`/actions/runs?branch=&event=push`) is the only source that names
  a cancelled run; the commit status shows a cancel as a failure. If it is missing, the CI green
  check fails with that reason rather than guessing.
