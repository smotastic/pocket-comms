import { describe, expect, it } from '@effect/vitest';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { HttpClientRequest } from 'effect/http';
import { layerOtlp } from './otlp.js';
import { recordingHttpClient, recordingLogger } from './testing.js';

const bodyText = (request: HttpClientRequest.HttpClientRequest) =>
  request.body._tag === 'Uint8Array' ? new TextDecoder().decode(request.body.body) : '';

// One span and one log line, then the layer closes, which flushes every exporter.
// The recording logger stands for the console logger that is already installed.
const run = (env: Record<string, string>, collectorStatus = 200) => {
  const client = recordingHttpClient({ status: collectorStatus });
  const logger = recordingLogger();
  const program = Effect.logInfo('hello').pipe(Effect.withSpan('work'));
  const layer = layerOtlp({ serviceName: 'example-server' }).pipe(
    Layer.provide(client.layer),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env }))),
  );
  return Effect.provide(program, layer).pipe(
    Effect.provide(logger.layer),
    Effect.as({ requests: client.requests, logs: logger.records }),
  );
};

const tracesBody = (requests: ReadonlyArray<HttpClientRequest.HttpClientRequest>) => {
  const traces = requests.find((request) => request.url.endsWith('/v1/traces'));
  return traces ? bodyText(traces) : '';
};

const endpoint = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318' };

describe('layerOtlp', () => {
  it.effect('exports nothing without any endpoint variable', () =>
    Effect.gen(function* () {
      const { requests } = yield* run({});
      expect(requests).toEqual([]);
    }),
  );

  it.effect('exports traces, metrics and logs to the endpoint', () =>
    Effect.gen(function* () {
      const { requests } = yield* run(endpoint);
      expect(new Set(requests.map((request) => request.url))).toEqual(
        new Set([
          'http://collector:4318/v1/traces',
          'http://collector:4318/v1/metrics',
          'http://collector:4318/v1/logs',
        ]),
      );
    }),
  );

  it.effect('names the service from the option', () =>
    Effect.gen(function* () {
      const { requests } = yield* run(endpoint);
      expect(tracesBody(requests)).toContain('"stringValue":"example-server"');
    }),
  );

  it.effect('lets OTEL_SERVICE_NAME override the name', () =>
    Effect.gen(function* () {
      const { requests } = yield* run({
        ...endpoint,
        OTEL_SERVICE_NAME: 'renamed-server',
      });
      expect(tracesBody(requests)).toContain('"stringValue":"renamed-server"');
    }),
  );

  it.effect('adds OTEL_RESOURCE_ATTRIBUTES to the resource', () =>
    Effect.gen(function* () {
      const { requests } = yield* run({
        ...endpoint,
        OTEL_RESOURCE_ATTRIBUTES: 'deployment.environment.name=homelab',
      });
      expect(tracesBody(requests)).toContain('"key":"deployment.environment.name"');
    }),
  );

  it.effect('takes the name from OTEL_RESOURCE_ATTRIBUTES when OTEL_SERVICE_NAME is not set', () =>
    Effect.gen(function* () {
      const { requests } = yield* run({
        ...endpoint,
        OTEL_RESOURCE_ATTRIBUTES: 'service.name=attribute-server',
      });
      expect(tracesBody(requests)).toContain('"stringValue":"attribute-server"');
    }),
  );

  it.effect('prefers OTEL_SERVICE_NAME over OTEL_RESOURCE_ATTRIBUTES', () =>
    Effect.gen(function* () {
      const { requests } = yield* run({
        ...endpoint,
        OTEL_SERVICE_NAME: 'renamed-server',
        OTEL_RESOURCE_ATTRIBUTES: 'service.name=attribute-server',
      });
      expect(tracesBody(requests)).toContain('"stringValue":"renamed-server"');
    }),
  );

  it.effect('keeps the loggers already installed when telemetry is on', () =>
    Effect.gen(function* () {
      const { logs } = yield* run(endpoint);
      expect(logs.map((record) => record.message)).toEqual(['hello']);
    }),
  );

  // Live clock: the exporter waits between its retries.
  it.live('never fails the program when the collector fails', () =>
    Effect.gen(function* () {
      const { requests, logs } = yield* run(endpoint, 503);
      expect(logs.map((record) => record.message)).toEqual(['hello']);
      expect(requests.length).toBeGreaterThan(0);
    }),
  );

  it.effect('exports only the signal whose own endpoint is set, to that URL as given', () =>
    Effect.gen(function* () {
      const { requests } = yield* run({
        OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'http://prometheus:9090/api/v1/otlp/v1/metrics',
      });
      expect(new Set(requests.map((request) => request.url))).toEqual(
        new Set(['http://prometheus:9090/api/v1/otlp/v1/metrics']),
      );
    }),
  );

  it.effect('prefers a signal endpoint over the base endpoint', () =>
    Effect.gen(function* () {
      const { requests } = yield* run({
        ...endpoint,
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://tempo:4318/custom/traces',
      });
      expect(new Set(requests.map((request) => request.url))).toEqual(
        new Set([
          'http://tempo:4318/custom/traces',
          'http://collector:4318/v1/metrics',
          'http://collector:4318/v1/logs',
        ]),
      );
    }),
  );

  // Prometheus's OTLP receiver compares the content type exactly.
  it.effect('sends metrics as application/json', () =>
    Effect.gen(function* () {
      const { requests } = yield* run(endpoint);
      const metrics = requests.find((request) => request.url.endsWith('/v1/metrics'));
      expect(metrics?.body._tag === 'Uint8Array' && metrics.body.contentType).toBe(
        'application/json',
      );
    }),
  );

  it.effect('appends the signal path to a base endpoint with a trailing slash', () =>
    Effect.gen(function* () {
      const { requests } = yield* run({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318/' });
      expect(requests.map((request) => request.url)).toContain('http://collector:4318/v1/traces');
    }),
  );
});
