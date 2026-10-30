# ADR 0006 — One inbound port per resource

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** amends ADR 0003

## TL;DR

We will declare one inbound port per resource, for example `BookmarksInbound` with six methods
and one `layer`, instead of one inbound port per use case. It halves the wiring files per use case,
and a test can still replace a single use case with `Layer.mock`.

## Context

ADR 0003 makes every inbound port a `Context.Service`. One port per use case means a new port
file, port class and wiring entry for every use case, which agents copy into every service.

## Options

| Criterion                     | A: port per use case | B: port per resource            |
| ----------------------------- | -------------------- | ------------------------------- |
| Files touched per use case    | ❌ port + wiring     | ✅ one method + one spread      |
| Replace one use case in tests | ✅ provide a layer   | ✅ `Layer.mock` with one method |
| Ports check                   | ✅                   | ✅ no rule change needed        |

## Decision

This amends two statements of ADR 0003; the rest stays:

- **Granularity.** An inbound port covers one resource and has one method per use case. A file
  `<resource>.inbound.port.ts` declares exactly one inbound port; `pnpm ports:check` enforces it.
- **Use case layer.** The layer is the static `<Resource>Inbound.layer` and provides all use cases
  of the resource.

Each use case keeps its own file in `application/src/use-cases/` with its own test and exports
`make<UseCase>`, an effect that returns its methods. The port's `layer` merges them:

```ts
export class BookmarksInbound extends Context.Service<
  BookmarksInbound,
  {
    readonly create: (input: CreateBookmarkInput) => Effect.Effect<BookmarkDto, CreateErrors>;
    readonly get: (id: string) => Effect.Effect<BookmarkDto, BookmarkNotFoundError>;
    // list, update, archive, delete
  }
>()('bookmarks/application/BookmarksInbound') {
  static readonly layer = Layer.effect(
    BookmarksInbound,
    Effect.gen(function* () {
      return { ...(yield* makeCreateBookmark), ...(yield* makeGetBookmark) /* … */ };
    }),
  );
}
```

The port is named after the plural resource (`BookmarksInbound`), matching the HTTP group. A
second inbound port for a resource needs a second kind of driving adapter with a clearly
different set of methods, and its reason goes into the spec.

## Consequences

- **Positive:** deeper ports, fewer wiring files, both test styles kept.
- **Negative / trade-offs:** the port file grows with the number of use cases.
- **Follow-ups:** none.
