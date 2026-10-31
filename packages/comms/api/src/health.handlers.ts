import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { HttpRouter, HttpServerResponse } from 'effect/http';

// A readiness check that hangs must not hang the probe; the orchestrator retries it anyway.
const READINESS_TIMEOUT = '2 seconds';

/**
 * `/health/live` answers while the process runs; `/health/ready` answers 200 only while
 * `readiness` succeeds in time, for example a `SELECT 1` against the database. Both stay outside
 * `/api/v1` and outside the published document.
 */
export const healthLayer = <E, R>(readiness: Effect.Effect<void, E, R>) =>
  Layer.mergeAll(
    HttpRouter.add('GET', '/health/live', HttpServerResponse.jsonUnsafe({ status: 'live' })),
    // The check runs with the services of the layer, not of the request, so `R` is provided
    // where the routes are built.
    HttpRouter.use((router) =>
      Effect.gen(function* () {
        const context = yield* Effect.context<R>();
        yield* router.add(
          'GET',
          '/health/ready',
          readiness.pipe(
            Effect.provideContext(context),
            Effect.timeout(READINESS_TIMEOUT),
            Effect.as(HttpServerResponse.jsonUnsafe({ status: 'ready' })),
            // The probe answers only 503; the log keeps why, so an operator can tell a stopped
            // database from a slow one or a wrong password.
            Effect.tapCause((cause) => Effect.logWarning('Not ready', cause)),
            Effect.catchCause(() =>
              Effect.succeed(
                HttpServerResponse.jsonUnsafe({ status: 'not ready' }, { status: 503 }),
              ),
            ),
          ),
        );
      }),
    ),
  );
