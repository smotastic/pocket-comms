import { describe, expect, it } from '@effect/vitest';
import * as ByteSize from 'effect/ByteSize';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { HttpIncomingMessage, HttpRouter, HttpServer, HttpServerResponse } from 'effect/http';
import { bodyLimit, MAX_BODY_BYTES } from './body-limit.js';

describe('the body limit', () => {
  it('limits the body every route reads to an image and a margin', async () => {
    // A route that answers the limit its request runs with.
    const probe = HttpRouter.add(
      'GET',
      '/limit',
      Effect.gen(function* () {
        const limit = yield* HttpIncomingMessage.MaxBodySize;
        return HttpServerResponse.jsonUnsafe({ limit: limit === undefined ? null : Number(limit) });
      }),
    );
    const app = HttpRouter.toWebHandler(
      Layer.mergeAll(probe, bodyLimit).pipe(Layer.provide(HttpServer.layerServices)),
      { disableLogger: true },
    );

    const response = await app.handler(new Request('http://localhost/limit'));
    await app.dispose();

    expect(await response.json()).toEqual({ limit: Number(ByteSize.bytes(MAX_BODY_BYTES)) });
    expect(MAX_BODY_BYTES).toBe(11 * 1024 * 1024);
  });
});
