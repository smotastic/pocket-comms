import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import type { HttpClient } from 'effect/http';
import { OtlpLogger, OtlpMetrics, OtlpSerialization, OtlpTracer } from 'effect/observability';

export interface ObservabilityOptions {
  /** The `service.name` when neither `OTEL_SERVICE_NAME` nor `OTEL_RESOURCE_ATTRIBUTES` sets one. */
  readonly serviceName: string;
}

const noAttributes: Readonly<Record<string, string>> = {};

type Signal = 'TRACES' | 'METRICS' | 'LOGS';

// OpenTelemetry's rule: a signal's own variable is used as given; the base gets `/v1/<signal>`.
const endpointOf = (signal: Signal) =>
  Config.String(`OTEL_EXPORTER_OTLP_${signal}_ENDPOINT`).pipe(
    Config.orElse(() =>
      Config.String('OTEL_EXPORTER_OTLP_ENDPOINT').pipe(
        Config.map((base) => `${base.replace(/\/$/u, '')}/v1/${signal.toLowerCase()}`),
      ),
    ),
    Config.option,
  );

/**
 * OTLP export, each signal switched on by its own endpoint variable or the shared base. Without
 * any, the layer is empty. Effect's own `layerFromConfig` would also need an
 * `OTEL_<SIGNAL>_EXPORTER` per signal (ADR 0010).
 */
export const layerOtlp = (
  options: ObservabilityOptions,
): Layer.Layer<never, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const [traces, metrics, logs] = yield* Config.all([
      endpointOf('TRACES'),
      endpointOf('METRICS'),
      endpointOf('LOGS'),
    ]);
    // OpenTelemetry's order for the name: `OTEL_SERVICE_NAME`, then `service.name` in
    // `OTEL_RESOURCE_ATTRIBUTES`, then the default. An explicit name would beat both in Effect.
    const [serviceNameEnv, resourceAttributes] = yield* Config.all([
      Config.option(Config.String('OTEL_SERVICE_NAME')),
      Config.Record(
        Schema.StringFromUriComponent,
        Schema.StringFromUriComponent,
        'OTEL_RESOURCE_ATTRIBUTES',
      ).pipe(Config.withDefault(noAttributes)),
    ]);
    const resource = {
      serviceName: Option.getOrElse(
        serviceNameEnv,
        () => resourceAttributes['service.name'] ?? options.serviceName,
      ),
    };
    const exporters = [
      Option.map(traces, (url) => OtlpTracer.layer({ url, resource })),
      Option.map(metrics, (url) => OtlpMetrics.layer({ url, resource })),
      Option.map(logs, (url) => OtlpLogger.layer({ url, resource })),
    ].flatMap(Option.toArray);
    const [first, ...rest] = exporters;
    if (first === undefined) return Layer.empty;
    return Layer.mergeAll(first, ...rest).pipe(Layer.provide(OtlpSerialization.layerJson));
  }).pipe(Effect.orDie, Layer.unwrap);
