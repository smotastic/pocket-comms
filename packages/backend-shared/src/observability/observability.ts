import * as Layer from 'effect/Layer';
import { FetchHttpClient, HttpMiddleware, HttpRouter, type HttpServerRequest } from 'effect/http';
import { layerOtlp, type ObservabilityOptions } from './otlp.js';
import { recordRoute, timeRequest } from './request-duration.js';

export { requestDuration } from './request-duration.js';

/** The health checks, polled by every probe; tracing them would bury the real requests. */
export const untracedPaths: ReadonlyArray<string> = ['/health/live', '/health/ready'];

/** Whether the request goes to an untraced path, whatever its query string. */
export const isUntraced = (request: HttpServerRequest.HttpServerRequest): boolean =>
  untracedPaths.includes(request.url.split('?', 1)[0] ?? request.url);

/** Observability for a server; its composition root provides this once. */
export const layer = (options: ObservabilityOptions): Layer.Layer<never> =>
  Layer.mergeAll(
    layerOtlp(options).pipe(Layer.provide(FetchHttpClient.layer)),
    Layer.succeed(HttpMiddleware.TracerDisabledWhen, isUntraced),
  );

/**
 * `HttpRouter.serve` with observability: the request duration of every route, and the layer
 * above for the server's requests. A server's composition root calls this in its place.
 */
export const serve = <A, E, R>(appLayer: Layer.Layer<A, E, R>, options: ObservabilityOptions) =>
  HttpRouter.serve(appLayer.pipe(Layer.provide(recordRoute)), { middleware: timeRequest }).pipe(
    Layer.provide(layer(options)),
  );
