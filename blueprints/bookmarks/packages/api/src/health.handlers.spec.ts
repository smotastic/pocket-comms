import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { HttpRouter, HttpServer } from 'effect/http';
import { healthLayer } from './index.js';

const serve = async (readiness: Effect.Effect<void, unknown>, path: string) => {
  const { handler, dispose } = HttpRouter.toWebHandler(
    healthLayer(readiness).pipe(Layer.provide(HttpServer.layerServices)),
    { disableLogger: true },
  );
  try {
    return (await handler(new Request(`http://localhost${path}`))).status;
  } finally {
    await dispose();
  }
};

describe('healthLayer', () => {
  it('answers /health/live with 200', async () => {
    expect(await serve(Effect.fail('database down'), '/health/live')).toBe(200);
  });

  it('answers /health/ready with 200 when the readiness check succeeds', async () => {
    expect(await serve(Effect.void, '/health/ready')).toBe(200);
  });

  it('answers /health/ready with 503 when the readiness check fails', async () => {
    expect(await serve(Effect.fail('database down'), '/health/ready')).toBe(503);
  });

  it('answers /health/ready with 503 when the readiness check does not finish in time', async () => {
    expect(await serve(Effect.never, '/health/ready')).toBe(503);
  }, 10_000);
});
