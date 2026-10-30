import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { HttpClient, HttpClientRequest } from 'effect/http';
import { recordingHttpClient, recordingLogger, recordingTracer } from './testing.js';

describe('recordingTracer', () => {
  it.effect('records every span with its parent', () =>
    Effect.gen(function* () {
      const tracer = recordingTracer();
      yield* Effect.void.pipe(
        Effect.withSpan('child'),
        Effect.withSpan('parent'),
        Effect.provide(tracer.layer),
      );
      const parent = tracer.spans.find((span) => span.name === 'parent');
      const child = tracer.spans.find((span) => span.name === 'child');
      expect(child && Option.getOrUndefined(child.parent)?.spanId).toBe(parent?.spanId);
    }),
  );
});

describe('recordingLogger', () => {
  it.effect('records each log line with the trace id of its span', () =>
    Effect.gen(function* () {
      const tracer = recordingTracer();
      const logger = recordingLogger();
      yield* Effect.logInfo('hello').pipe(
        Effect.withSpan('work'),
        Effect.provide([tracer.layer, logger.layer]),
      );
      expect(logger.records).toEqual([
        { message: 'hello', traceId: tracer.spans[0]?.traceId, level: 'Info' },
      ]);
    }),
  );
});

describe('recordingHttpClient', () => {
  it.effect('records each request and answers 200', () =>
    Effect.gen(function* () {
      const client = recordingHttpClient();
      const response = yield* HttpClient.execute(
        HttpClientRequest.post('http://collector/v1/traces'),
      ).pipe(Effect.provide(client.layer));
      expect(response.status).toBe(200);
      expect(client.requests.map((request) => request.url)).toEqual(['http://collector/v1/traces']);
    }),
  );

  it.effect('answers with the given status', () =>
    Effect.gen(function* () {
      const client = recordingHttpClient({ status: 503 });
      const response = yield* HttpClient.execute(
        HttpClientRequest.post('http://collector/v1/traces'),
      ).pipe(Effect.provide(client.layer));
      expect(response.status).toBe(503);
    }),
  );
});
