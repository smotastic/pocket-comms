---
name: effect
description: Write backend code with Effect 4 (4.0.0-rc.118) the way this repository does. Use before writing or reviewing any domain, application, infrastructure, api, contract or composition-root code in a backend service or the blueprint, and before writing its tests.
---

# Effect 4 in this repository

The runnable reference is the comms service (`packages/comms/`, `apps/comms-server`). Copy its shapes; this skill says why they look
the way they do and which Effect 4 details trip agents up. ADRs 0002 to 0008 are the decisions
behind it. Much public Effect material shows Effect 3; where it disagrees with this file, this file
and the installed sources win. pnpm keeps them in
`node_modules/.pnpm/effect@4.0.0-rc.118/node_modules/effect/src`; each project also links them at
`<project>/node_modules/effect`.

## Versions

- `effect`, `@effect/platform-node`, `@effect/sql-pg` and `@effect/vitest` come from the catalog at
  exactly `4.0.0-rc.118` and move together.
- `@effect/vitest` rc.118 needs Vitest 5, so the workspace runs Vitest 5 on Nx
  `23.3.0-beta.7` (the first Nx line that supports it). `test` and `lint` are inferred targets
  (`@nx/vitest`, `@nx/eslint/plugin`); the executors are deprecated.
- The Effect language service is a TypeScript plugin in `tsconfig.base.json`; editors that use the
  workspace TypeScript show its diagnostics.
- When an API in a plan does not exist in this release, read its `.d.ts` or its source (see the path
  above) and follow the installed version. The package ships examples in its `ai-docs/` folder.

## Imports

- Domain code imports **only** pure subpaths: `effect/Schema`, `effect/Data`, `effect/Brand`,
  `effect/Option`, `effect/Result`, `effect/Equal`, `effect/Order`, `effect/Array`,
  `effect/Record`, `effect/Struct`, `effect/Predicate`, `effect/Function`, `effect/Match`,
  `effect/DateTime`, `effect/BigDecimal`. Never the `effect` barrel: dependency-cruiser sees
  modules, not names, so the barrel would hide a forbidden import. `no-framework-imports-in-domain`
  and its ESLint mirror enforce this; the self-tests of `@smotastic/pocket-ci` prove they fire.
- Outside the domain, import modules by subpath too (`import * as Effect from 'effect/Effect'`).
  The unstable modules live under `effect/http`, `effect/http-api` and `effect/sql`.

## Domain

- Value objects are branded schemas: `Schema.String.check(...).pipe(Schema.brand('Title'))`;
  `Title.make(value)` throws on invalid input, so use it only for constants and tests.
- Domain functions are pure and return `Result`; errors are `Data.TaggedError`. Parse raw input
  field by field, so one failed field never hides another, and report `FieldIssue`s
  (`@pocket-comms/backend-shared`).
- A function that changes nothing returns the **same** value (`changeBookmark`,
  `archiveBookmark`); the use case compares by identity and then stores nothing.

## Ports, use cases and adapters (ADR 0003, ADR 0006)

- Ports are `Context.Service<Self, Shape>()('scope/layer/Name')` classes in
  `application/src/ports/`. A variable that holds a port is named after it:
  `const bookmarkRepositoryOutbound = yield* BookmarkRepositoryOutbound`.
- A resource has one inbound port with one method per use case (`BookmarksInbound`). Its static
  `layer` joins the use cases: `Layer.effect(BookmarksInbound, Effect.gen(function* () { return
{ ...(yield* makeCreateBookmark), ...(yield* makeGetBookmark) } }))`. Each `make<UseCase>` lives
  in `use-cases/` with its test and returns its method, so the port file imports it and no cycle
  appears. A new use case adds a method, not a port.
- To test a handler without its use cases, provide `Layer.mock(BookmarksInbound, { get })`. Give
  it only the methods the test calls. A method that is not given fails with a defect when it is
  called.
- Use cases take and return plain DTOs; no domain type reaches a handler.
- Adapters are layers in infrastructure, exported as namespaces (`BookmarkRepository.layerSql`,
  `IdGenerator.layerUuidV7`) so they never shadow the port classes.
- Time comes from the Effect clock (`DateTime.now`, `Clock.currentTimeMillis`), so tests control
  it with `TestClock`.
- Turn a `Result` into an effect with `Effect.fromResult`; `yield*` on a `Result` does not work in
  `Effect.gen`.

## SQL (ADR 0004)

- Queries use the `sql` template, `sql.insert`, `sql.update` and `sql.and`; never string
  concatenation. Rows decode through the persistence row schema and then the domain schema.
- Map only expected failures: `Effect.catchReason('SqlError', 'UniqueViolation', ...)` and check
  `reason.constraint`, because a duplicate primary key is a defect, not a conflict. Every other
  `SqlError` is a defect (`Effect.orDie`).
- `@effect/sql-pg` cannot infer the type of an empty array: bind `text[]` with
  `Result.getOrThrow(PgTypes.array(values, PgTypes.OID.text))`. `PgTypes.array` returns a
  `Result`, which fails only for an unknown element type.
- Keyset paging: `(created_at, id) < ($1, $2)` with `ORDER BY created_at DESC, id DESC` and
  `LIMIT limit + 1`; the extra row tells whether a next page exists.
- **Migrations.** `Migrator.make({})` with `Migrator.fromRecord` of a static import map. The
  `Migrator` creates its migrations table **outside** its lock (`select …::regclass`, then
  `CREATE TABLE`), so two first-time runners race and one fails. `runMigrations` therefore first
  runs one transaction that takes `pg_advisory_xact_lock`, creates the schema and creates the
  migrations table with the `Migrator`'s own columns (`migration_id integer primary key`,
  `created_at timestamptz not null default now()`, `name text not null`). Do not drop this
  pre-step; `migrator.spec.ts` starts two runners at once to prove it.
- Rows, migrations and the migrator live in the infrastructure package; the composition root
  runs `runMigrations` from there as its own step (`migrate.ts`).

## HTTP API (ADR 0005)

- One `HttpApi` per service in its contract package (`packages/<service>/contract`, in the
  comms service `@pocket-comms/comms-contract`). Server and web app both import it. Annotate it with
  `HttpApi.ParseOptions` `{ errors: 'all' }`, or a `422` names only the first failed field.
- Wire schemas repeat every value-object rule, so one decoding pass names every failed field.
- Errors are the Problem Details classes of `@pocket-comms/contracts-problem-details`, declared through
  `Problems.*` (served as `application/problem+json`). Add `ValidationMiddleware` to every group
  that takes input and provide `validationMiddlewareLayer` from `@pocket-comms/backend-shared/http`.
- In rc.118 request-decoding failures reach the middleware as a typed failure of
  `HttpApiSchemaError`; the framework decodes path, headers, query and body one after another and
  stops at the first part that fails.
- Map each tagged error explicitly with `Effect.catchTags({ … })`; an object with extra keys does
  not type-check.
- Response headers: `HttpApiSchema.WithHeaders(schema, { etag })` and
  `HttpApiSchema.withHeaders({ body, headers })`.
- Health routes are plain `HttpRouter.add` routes outside the API. A route effect that needs a
  service must get it when the routes are built (`Effect.context()` then `Effect.provideContext`),
  not from the request.

## OpenAPI details of rc.118

- `Schema.isPattern` reaches the document only when the regular expression has the `u` flag
  (and no `i`): write `/^[a-z0-9]+$/u`.
- A custom `Schema.makeFilter` after other checks drops the annotations from the document; put
  the custom filter first.
- Annotations of a transformed schema (`Schema.DateTimeUtcFromString`, `Schema.Trim`) belong on
  the encoded side: `Schema.annotateEncoded({ description, examples })`.
- Effect writes a parameter's description only into its schema; `liftParameterDocs` (an
  `OpenApi` transform) copies it onto the parameter, where Redocly and UI tools look.
- The committed document is canonical JSON (`openApiDocument`); regenerate with
  `pnpm nx run-many -t openapi`.

## Types

- Every package whose types a project's declarations name must be a dependency of that project.
  An undeclared one resolves to `any` without an error and hides missing services in layer
  types.
- No `as never`, `as unknown as`, `as any` or non-null assertions in code or tests. Narrow with
  `instanceof` or a type guard.

## Web apps (ADR 0008)

- Build the client once: `HttpApiClient.make(BookmarksApi, { baseUrl })`, provided with
  `FetchHttpClient.layer`. Run calls with `Effect.runPromise` at the React edge; keep components
  free of Effect plumbing beyond that.
- Branch on the Problem Details classes of the contract (`NotFoundProblem`,
  `ValidationProblem`, …) to show `title` and field `errors`.
- A web app imports contract packages only; never domain, application or infrastructure.

## Observability (ADR 0010)

- Name every use case and repository method with `Effect.fn('Port.method')`; it becomes a span
  under the HTTP server span. Log with `Effect.log*`; a log line carries the trace id of its
  span. Domain, application and infrastructure code never wire telemetry.
- A server's composition root calls `Observability.serve(appLayer, { serviceName })` from
  `@pocket-comms/backend-shared/observability` in place of `HttpRouter.serve`. Only server composition
  roots may import it (`observability-in-servers-only`).
- Each signal is off until `OTEL_EXPORTER_OTLP_<SIGNAL>_ENDPOINT` (or the base
  `OTEL_EXPORTER_OTLP_ENDPOINT`) is set. Do not use Effect's `Otlp.layerFromConfig`: it also needs
  `OTEL_<SIGNAL>_EXPORTER=otlp` and dies without `OTEL_SERVICE_NAME`.
- Effect's router sets `http.route` on the server span only while spans are exported, and ends
  the server span in a task after the response: in tests, wait for spans to end before asserting.
- `it.effect` runs on the `TestClock`, so the exporter's retry delays never pass; use `it.live`
  for a test that waits on an exporter.
- Tests use `recordingTracer`, `recordingLogger` and `recordingHttpClient` from
  `@pocket-comms/backend-shared/observability/testing`, and a fresh `Metric.MetricRegistry` for metrics.
  Give each test an empty `ConfigProvider` so the shell's `OTEL_*` variables never reach a real
  backend.

## Tests

- `@effect/vitest`: `it.effect` for effect tests, `layer(L)(name, (it) => …)` to share one
  expensive layer (a database) per file; `Effect.provide(body, layer)` per test rebuilds a layer
  and so isolates state.
- Use-case tests use the fakes in `application/src/testing`; application tests cannot import
  infrastructure. The repository contract suite in `infrastructure/src/testing` runs against every
  repository adapter.
- API acceptance tests use a client derived with `HttpApiTest.groups`; invalid requests go over raw
  HTTP (`HttpRouter.toWebHandler`), because the derived client refuses to encode them.
- Repository and runtime tests start PostgreSQL with Testcontainers. On a Podman machine Ryuk (the
  Testcontainers cleanup container) does not start: run them with
  `TESTCONTAINERS_RYUK_DISABLED=true`. Every test layer stops its own container; CI uses Docker
  with Ryuk.

## Anti-patterns

| Do not                                          | Do                                                 |
| ----------------------------------------------- | -------------------------------------------------- |
| `import { Schema } from 'effect'` in the domain | `import * as Schema from 'effect/Schema'`          |
| Throw for an expected failure                   | Fail with a tagged error                           |
| Catch every `UniqueViolation` as a conflict     | Check `reason.constraint`; the rest is a defect    |
| `new Date()` or `Date.now()` in a use case      | `DateTime.now` from the Effect clock               |
| A port variable named `repo` or `publisher`     | The port name: `bookmarkRepositoryOutbound`        |
| Return a changed copy that equals the input     | Return the same value, then store nothing          |
| Cast to silence the compiler                    | Declare the missing dependency, or narrow the type |
| Run the `Migrator` without the locked pre-step  | `runMigrations` from the infrastructure package    |
