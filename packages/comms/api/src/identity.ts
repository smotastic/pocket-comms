import { TailscaleIdentity } from '@pocket-comms/comms-contract';
import { isAllowedLogin } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { forbidden } from './problems.js';

// `tailscale serve` adds the caller's login as this header and drops one the caller sent.
const LOGIN_HEADER = 'tailscale-user-login';

const loginOf = (request: HttpServerRequest.HttpServerRequest) => request.headers[LOGIN_HEADER];

/**
 * The identity check on every route, the API, the web app, the documents and the health routes
 * alike (spec 004, requirement 20): a request without the allowed login gets a `403` problem.
 */
export const identityGuard = (allowedLogin: string) =>
  HttpRouter.middleware(
    (httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        if (isAllowedLogin(loginOf(request), allowedLogin)) return yield* httpEffect;
        return HttpServerResponse.jsonUnsafe(
          { type: forbidden.type, title: forbidden.title, status: 403, detail: forbidden.detail },
          { status: 403, contentType: 'application/problem+json' },
        );
      }),
    { global: true },
  );

/** The contract's `TailscaleIdentity`, with the same check as the guard. */
export const tailscaleIdentityLayer = (allowedLogin: string) =>
  Layer.succeed(TailscaleIdentity, (httpEffect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (!isAllowedLogin(loginOf(request), allowedLogin)) return yield* Effect.fail(forbidden);
      return yield* httpEffect;
    }),
  );
