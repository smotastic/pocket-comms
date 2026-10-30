import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Metric from 'effect/Metric';
import * as Option from 'effect/Option';
import {
  HttpRouter,
  HttpServerError,
  HttpServerRequest,
  type HttpServerResponse,
} from 'effect/http';

/**
 * The OpenTelemetry HTTP server duration, in seconds. Effect takes the OTLP unit from the `unit`
 * attribute, so every series carries it too.
 */
export const requestDuration = Metric.histogram('http.server.request.duration', {
  description: 'Duration of HTTP server requests.',
  attributes: { unit: 's' },
  boundaries: [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10],
});

// The route pattern of the current request, filled in once the router has matched it.
class MatchedRoute extends Context.Service<MatchedRoute, { path: string | undefined }>()(
  '@pocket-comms/backend-shared/observability/MatchedRoute',
) {}

/**
 * Route middleware that tells `timeRequest` the matched pattern. Only route middleware sees
 * it; the router puts it on the server span only when a tracer exports spans.
 */
export const recordRoute = HttpRouter.middleware((handler) =>
  Effect.gen(function* () {
    const { route } = yield* HttpRouter.RouteContext;
    const matched = yield* Effect.serviceOption(MatchedRoute);
    if (Option.isSome(matched)) matched.value.path = route.path;
    return yield* handler;
  }),
).layer;

/** Server middleware that records every request, matched or not, in `requestDuration`. */
export const timeRequest = <E, R>(
  app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  E,
  R | HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const matched: { path: string | undefined } = { path: undefined };
    const start = yield* Clock.currentTimeNanos;
    const exit = yield* Effect.exit(Effect.provideService(app, MatchedRoute, matched));
    const end = yield* Clock.currentTimeNanos;
    const status = Exit.isSuccess(exit)
      ? exit.value.status
      : (yield* HttpServerError.causeResponse(exit.cause))[0].status;
    const attributes: Record<string, string> = {
      'http.request.method': request.method,
      'http.response.status_code': String(status),
    };
    if (matched.path !== undefined) attributes['http.route'] = matched.path;
    yield* Metric.update(
      Metric.withAttributes(requestDuration, attributes),
      Number(end - start) / 1e9,
    );
    return yield* exit;
  });
