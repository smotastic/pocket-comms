# Tasks 034 — pocket-comms: planets and preflight

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit. T01 is the first pull request; T02–T08 the second.

- [x] **T01** — The rename: project becomes planet in domain, application, infrastructure,
      contract, API, server and web app (`/planets`, `/planets/$planet`, the `planet` fields,
      `PlanetNotFound`), and repositories below the root become `Repository` and
      `RepositoriesOutbound`; no behaviour change. The accepted OpenAPI lines for the renamed paths
      and fields.
  - Serves: 15
  - Gate: `pnpm verify:local`; `OPENAPI_BASE_REF=origin/master pnpm openapi:diff` passes with the
    accepted lines; `git grep -i project` in `packages/comms`, `apps/comms-*` finds only Nx's
    `project.json`, the `COMMS_PROJECTS_ROOT` setting and its config key.

- [ ] **T02** — Domain rules: the seed choice, `planetWorkspaces` (non-planets to Other),
      `preflightOf(facts)` with the five checks, the Gitea cascade, the CI run choice, go/no-go and
      the effective autonomy level.
  - Serves: 2, 4, 7, 8, 9, 11, 12
  - Gate: domain unit tests.

- [ ] **T03** — The registry: `PlanetsOutbound` and its `planets.json` file store; the planets
      use case lists planets from the registry (and the others), registers, unregisters, and
      seeds once when the server starts; work in a non-planet answers `PlanetNotFound`.
  - Serves: 1, 2, 3, 5, 6
  - Gate: file store and use case tests (fakes); composition test that the seed runs at start.

- [ ] **T04** — Non-planets fall under Other in the overview and the agents' `planet` field;
      the overview changes when the registry does.
  - Serves: 4, 6
  - Gate: overview use case test with an unregistered repository's agent.

- [ ] **T05** — Gitea reads for preflight: the repository's default branch, a file's text, a
      folder's names and the push runs of a branch, each 404 as none.
  - Serves: 7
  - Gate: Gitea HTTP adapter tests against the fake server.

- [ ] **T06** — Preflight in the application: gather the facts, compute, reuse for 60 seconds;
      Gitea down answers no-go.
  - Serves: 7, 8, 9, 10, 12
  - Gate: use case tests with fakes and a test clock.

- [ ] **T07** — Contract and API: `GET /planets` with `others`, `POST /planets`,
      `DELETE /planets/:planet`, `GET /planets/:planet/preflight`; the accepted OpenAPI lines.
  - Serves: 3, 5, 6, 7–12
  - Gate: `comms-api.spec.ts`; `openapi:diff`.

- [ ] **T08** — Web: the planets sheet's go/no-go tags and **Other repositories** with
      **Register**; the planet page's **Preflight** card with the checks, the levels (missions and
      autopilot as coming) and **Unregister** asking in place.
  - Serves: 5, 6, 11, 13, 14
  - Gate: web tests; a look at 390 px in the browser.

- [ ] **T09** — Docs: `packages/comms/AGENTS.md` (the planets file, the preflight rules), spec
      and plan to `Done`.
  - Serves: —
  - Gate: `pnpm format`; review.
