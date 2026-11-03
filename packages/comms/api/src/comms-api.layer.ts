import { validationMiddlewareLayer } from '@pocket-comms/backend-shared/http';
import { CommsApi } from '@pocket-comms/comms-contract';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { HttpApiBuilder, HttpApiScalar } from 'effect/http-api';
import { agentsHandlers } from './agents.handlers.js';
import { bodyLimit } from './body-limit.js';
import { brainstormHandlers } from './brainstorm.handlers.js';
import { issuesHandlers } from './issues.handlers.js';
import { tasksHandlers } from './tasks.handlers.js';
import { healthLayer } from './health.handlers.js';
import { imageSweepLayer, imagesHandlers } from './images.handlers.js';
import { identityGuard, tailscaleIdentityLayer } from './identity.js';
import { pushHandlers, pushWatchLayer } from './push.handlers.js';
import { webAppLayer } from './web-app.js';

export interface CommsServerOptions<E, R> {
  /** The Tailscale login that may use the server (spec 004, requirement 21). */
  readonly allowedLogin: string;
  /** Succeeds while the server can serve, such as while Herdr answers. */
  readonly readiness: Effect.Effect<void, E, R>;
  /** The folder of the built web app; without it the server serves the API only. */
  readonly webDist?: string;
}

/** The API routes with the handlers' middleware. The caller provides the inbound ports. */
export const commsApiLayer = (allowedLogin: string) =>
  HttpApiBuilder.layer(CommsApi, { openapiPath: '/docs/openapi.json' }).pipe(
    Layer.provide([
      agentsHandlers,
      tasksHandlers,
      issuesHandlers,
      brainstormHandlers,
      imagesHandlers,
      pushHandlers,
    ]),
    Layer.provide(tailscaleIdentityLayer(allowedLogin)),
    Layer.provide(validationMiddlewareLayer),
  );

/**
 * Every route of the server behind the identity guard: the API, its document and browser UI at
 * `/docs`, the health routes and, when built, the web app.
 */
export const commsServerLayer = <E, R>({
  allowedLogin,
  readiness,
  webDist,
}: CommsServerOptions<E, R>) =>
  Layer.mergeAll(
    commsApiLayer(allowedLogin),
    HttpApiScalar.layer(CommsApi, { path: '/docs' }),
    healthLayer(readiness),
    imageSweepLayer,
    pushWatchLayer,
    webDist === undefined ? Layer.empty : webAppLayer(webDist),
    identityGuard(allowedLogin),
    bodyLimit,
  );
