import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import { Headers } from 'effect/http';
import { Observability } from './index.js';

describe('Observability.layer', () => {
  it.effect('needs no other service and leaves a program unchanged', () =>
    Effect.gen(function* () {
      const result = yield* Effect.succeed(42).pipe(
        Effect.withSpan('work'),
        Effect.provide(Observability.layer({ serviceName: 'example-server' })),
      );
      expect(result).toBe(42);
    }),
  );

  it.effect('redacts the authorization, cookie and set-cookie headers', () =>
    Effect.gen(function* () {
      const redacted = yield* Effect.service(Headers.CurrentRedactedNames).pipe(
        Effect.provide(Observability.layer({ serviceName: 'example-server' })),
      );
      expect(redacted).toEqual(expect.arrayContaining(['authorization', 'cookie', 'set-cookie']));
    }),
  );
});
