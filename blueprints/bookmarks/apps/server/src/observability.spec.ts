import { NodeHttpServer } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Observability } from '@pocket-comms/backend-shared/observability';
import {
  recordingLogger,
  recordingTracer,
} from '@pocket-comms/backend-shared/observability/testing';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Metric from 'effect/Metric';
import * as Option from 'effect/Option';
import type * as Tracer from 'effect/Tracer';
import { HttpClient, HttpClientRequest } from 'effect/http';
import { inMemoryServices, server } from './composition.js';

// What the server reports about its requests, read from a recording tracer, logger and metric
// registry in place of an OTLP backend. The server is composed as in `main.ts` and served on a
// random port.
describe('server observability', () => {
  // The tests never read the shell's `OTEL_*` variables, so none of them reaches a real backend.
  const recorded = (env: Record<string, string> = {}) => {
    const tracer = recordingTracer();
    const logger = recordingLogger();
    const registry: Metric.MetricRegistry = new Map();
    const telemetry = Layer.mergeAll(
      tracer.layer,
      logger.layer,
      Layer.succeed(Metric.MetricRegistry, registry),
      ConfigProvider.layer(ConfigProvider.fromEnv({ env })),
    );
    return { tracer, logger, registry, telemetry };
  };
  type Recording = ReturnType<typeof recorded>;

  const createBookmark = (headers: Record<string, string> = {}) =>
    HttpClientRequest.post('/api/v1/bookmarks').pipe(
      HttpClientRequest.setHeaders(headers),
      HttpClientRequest.bodyJsonUnsafe({
        url: 'https://effect.website',
        title: 'Effect',
        tags: [],
      }),
    );

  // Effect ends the server span and sets its response attributes in a task after the response.
  const settled = (spans: ReadonlyArray<Tracer.NativeSpan>) =>
    Effect.promise(async () => {
      for (let tick = 0; tick < 100 && spans.some((span) => span.status._tag !== 'Ended'); tick++) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    });

  // The client runs outside the recorded telemetry, so its own spans stay out of the recording.
  const send = (
    recording: Recording,
    requests: ReadonlyArray<HttpClientRequest.HttpClientRequest>,
  ) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const statuses: Array<number> = [];
      for (const request of requests) statuses.push((yield* client.execute(request)).status);
      yield* settled(recording.tracer.spans);
      return statuses;
    }).pipe(
      Effect.provideService(HttpClient.TracerPropagationEnabled, false),
      Effect.provide(
        server(Effect.void).pipe(
          Layer.provide(inMemoryServices),
          Layer.provide(recording.telemetry),
          Layer.provideMerge(NodeHttpServer.layerTest),
        ),
      ),
    );

  const named = (spans: ReadonlyArray<Tracer.NativeSpan>, name: string) =>
    spans.find((span) => span.name === name);
  const parentOf = (span: Tracer.NativeSpan | undefined) =>
    span && Option.getOrUndefined(span.parent)?.spanId;
  const failed = (span: Tracer.NativeSpan | undefined) =>
    span?.status._tag === 'Ended' && Exit.isFailure(span.status.exit);

  it.live('traces a create from the request down to the repository', () =>
    Effect.gen(function* () {
      const recording = recorded();
      yield* send(recording, [createBookmark()]);
      const spans = recording.tracer.spans;
      const httpServer = named(spans, 'http.server POST');
      const useCase = named(spans, 'CreateBookmark.create');
      const insert = named(spans, 'BookmarkRepository.insert');
      expect(httpServer?.attributes.get('http.route')).toBe('/api/v1/bookmarks');
      expect(httpServer?.attributes.get('http.response.status_code')).toBe(201);
      expect(parentOf(useCase)).toBe(httpServer?.spanId);
      expect(parentOf(insert)).toBe(useCase?.spanId);
      expect([httpServer, useCase, insert].map((span) => span?.status._tag)).toEqual([
        'Ended',
        'Ended',
        'Ended',
      ]);
    }),
  );

  it.live('marks a conflict on the use case, not on the server span', () =>
    Effect.gen(function* () {
      const recording = recorded();
      const statuses = yield* send(recording, [createBookmark(), createBookmark()]);
      expect(statuses).toEqual([201, 409]);
      const spans = recording.tracer.spans;
      const conflicted = spans.filter((span) => span.name === 'CreateBookmark.create')[1];
      const httpServer = spans.filter((span) => span.name === 'http.server POST')[1];
      expect(failed(conflicted)).toBe(true);
      expect(httpServer?.attributes.get('http.response.status_code')).toBe(409);
      expect(failed(httpServer)).toBe(false);
      expect(recording.logger.records.map((record) => record.traceId)).toContain(
        httpServer?.traceId,
      );
    }),
  );

  it.live('joins the trace of an incoming traceparent header', () =>
    Effect.gen(function* () {
      const recording = recorded();
      const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      yield* send(recording, [
        createBookmark({ traceparent: `00-${traceId}-00f067aa0ba902b7-01` }),
      ]);
      expect(named(recording.tracer.spans, 'http.server POST')?.traceId).toBe(traceId);
    }),
  );

  it.live('records no span for the health checks', () =>
    Effect.gen(function* () {
      const recording = recorded();
      const statuses = yield* send(recording, [
        HttpClientRequest.get('/health/live'),
        HttpClientRequest.get('/health/ready'),
        HttpClientRequest.get('/health/live?probe=kubelet'),
      ]);
      expect(statuses).toEqual([200, 200, 200]);
      expect(recording.tracer.spans).toEqual([]);
    }),
  );

  it.live('redacts the authorization and cookie headers on the server span', () =>
    Effect.gen(function* () {
      const recording = recorded();
      yield* send(recording, [
        createBookmark({ authorization: 'Bearer secret-token', cookie: 'session=secret' }),
      ]);
      const httpServer = named(recording.tracer.spans, 'http.server POST');
      expect(httpServer?.attributes.get('http.request.header.authorization')).toBe('<redacted>');
      expect(httpServer?.attributes.get('http.request.header.cookie')).toBe('<redacted>');
    }),
  );

  it.live('records the duration of every request by method, route and status code', () =>
    Effect.gen(function* () {
      const recording = recorded();
      yield* send(recording, [
        createBookmark(),
        createBookmark(),
        HttpClientRequest.get('/health/live'),
      ]);
      const count = (method: string, route: string, status: string) =>
        Metric.value(
          Metric.withAttributes(Observability.requestDuration, {
            'http.request.method': method,
            'http.route': route,
            'http.response.status_code': status,
          }),
        ).pipe(
          Effect.map((state) => state.count),
          Effect.provideService(Metric.MetricRegistry, recording.registry),
        );
      expect(yield* count('POST', '/api/v1/bookmarks', '201')).toBe(1);
      expect(yield* count('POST', '/api/v1/bookmarks', '409')).toBe(1);
      expect(yield* count('GET', '/health/live', '200')).toBe(1);
    }),
  );

  it.live('keeps serving when the OTLP endpoint is unreachable', () =>
    Effect.gen(function* () {
      const recording = recorded({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9' });
      const started = Date.now();
      const statuses = yield* send(recording, [createBookmark(), createBookmark()]);
      expect(statuses).toEqual([201, 409]);
      // The exporter flushes when the server stops and gives up after its shutdown timeout.
      expect(Date.now() - started).toBeLessThan(5_000);
    }),
  );
});
