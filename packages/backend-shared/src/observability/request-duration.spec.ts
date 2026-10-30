import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Metric from 'effect/Metric';
import { HttpRouter, HttpServer, HttpServerResponse } from 'effect/http';
import { recordRoute, requestDuration, timeRequest } from './request-duration.js';

const routes = Layer.mergeAll(
  HttpRouter.add('GET', '/things/:id', HttpServerResponse.text('thing')),
  HttpRouter.add('POST', '/things', HttpServerResponse.empty({ status: 409 })),
  HttpRouter.add('GET', '/health/live', HttpServerResponse.text('ok')),
);

// Serves the routes as `Observability.serve` does and returns the histogram of the requests.
const durations = (paths: ReadonlyArray<readonly [method: string, path: string]>) =>
  Effect.promise(async () => {
    const registry: Metric.MetricRegistry = new Map();
    const { handler, dispose } = HttpRouter.toWebHandler(
      routes.pipe(
        Layer.provide(recordRoute),
        Layer.provide(HttpServer.layerServices),
        Layer.provideMerge(Layer.succeed(Metric.MetricRegistry, registry)),
      ),
      { middleware: timeRequest, disableLogger: true },
    );
    try {
      for (const [method, path] of paths) {
        await handler(new Request(`http://localhost${path}`, { method }));
      }
    } finally {
      await dispose();
    }
    return registry;
  });

const countOf = (registry: Metric.MetricRegistry, attributes: Record<string, string>) =>
  Metric.value(Metric.withAttributes(requestDuration, attributes)).pipe(
    Effect.map((state) => state.count),
    Effect.provideService(Metric.MetricRegistry, registry),
  );

describe('request duration', () => {
  it.effect('counts requests per method, route pattern and status code', () =>
    Effect.gen(function* () {
      const registry = yield* durations([
        ['GET', '/things/1'],
        ['GET', '/things/2'],
        ['POST', '/things'],
        ['GET', '/health/live?probe=1'],
      ]);
      const route = (method: string, pattern: string, status: string) => ({
        'http.request.method': method,
        'http.route': pattern,
        'http.response.status_code': status,
      });
      expect(yield* countOf(registry, route('GET', '/things/:id', '200'))).toBe(2);
      expect(yield* countOf(registry, route('POST', '/things', '409'))).toBe(1);
      expect(yield* countOf(registry, route('GET', '/health/live', '200'))).toBe(1);
    }),
  );

  it.effect('records a request that matches no route without a route pattern', () =>
    Effect.gen(function* () {
      const registry = yield* durations([['GET', '/unknown/1']]);
      const count = yield* countOf(registry, {
        'http.request.method': 'GET',
        'http.response.status_code': '404',
      });
      expect(count).toBe(1);
    }),
  );
});
