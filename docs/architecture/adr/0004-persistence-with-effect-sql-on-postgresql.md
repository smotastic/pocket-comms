# ADR 0004 — Persistence with effect/sql on PostgreSQL

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** constitution principles 2, 8; ADRs 0002, 0003

## TL;DR

We will store service data in PostgreSQL and reach it through `effect/sql` with the
`@effect/sql-pg` driver. Queries are parameterized SQL, rows are decoded with Effect Schema, and
migrations run through the Effect `Migrator` as a separate step. It is the database access that
fits Effect 4 without hand-written glue.

## Context

Services need a relational store with transactions and unique constraints. The access library
must speak Effect (ADR 0002), keep SQL visible and testable, and keep business logic out of the
database (principle 2). Drizzle has no Effect 4 integration.

**Scope:** the store, the access library, where persistence code lives and how migrations run.

## Decision

- **PostgreSQL** is the default store. Each service gets its own PostgreSQL schema.
- **Where the code lives** (all in `infrastructure`):
  - row schemas and mappers between rows and domain types;
  - repository layers that implement outbound ports with `SqlClient` and return domain types;
  - migrations in `src/migrations/<id>_<name>.ts` and the migrator.
    The composition root provides the `@effect/sql-pg` client layer, configured through `Config`
    with the URL as a `Redacted` secret.
- **SQL.** Queries use the `sql` tagged template, which binds every value as a parameter. String
  concatenation into SQL is forbidden. Multi-statement writes use `sql.withTransaction`.
- **No business logic in the database.** No triggers, stored procedures or check constraints that
  encode business rules. Integrity constraints (primary keys, `NOT NULL`, unique keys) are fine.
- **Errors.** Expected conflicts (a unique-key violation on a known constraint) become port
  errors; every other `SqlError` is a defect.
- **Migrations.**
  - Forward-only. A merged migration never changes; fix it with a new one.
  - Prefer additive, backward-compatible changes (expand, then contract later).
  - A migration runs only SQL and imports no domain or application code.
  - Migrations run as their own step (`migrate.ts`) before the server starts. The step takes an
    advisory lock and creates the migrations table first, so two runners never race.
  - Every migration needs human approval (principle 8). There is no automated migration gate; the
    reviewer checks the rules above.
- **Tests.** Repository layers run against a real PostgreSQL from Testcontainers; use-case tests
  use in-memory adapters.

## Consequences

- **Positive:** typed, parameterized SQL; one schema library from row to wire; repositories are
  tested against the real database.
- **Negative / trade-offs:** hand-written SQL instead of a query builder; migration rules depend
  on human review.
- **Follow-ups:** none.
