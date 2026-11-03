import { describe, expect, it } from '@effect/vitest';
import { PushSenderOutbound } from '@pocket-comms/comms-application';
import type { Notification, PushSubscription } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Logger from 'effect/Logger';
import { createECDH, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layerFile } from './file-store.js';
import { layerWebPush } from './web-push.js';

interface Received {
  readonly url: string | undefined;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
}

// A fake push service on a free local port; it answers every request with `status`.
const fakePushService = (status: number, headers: Record<string, string> = {}) =>
  Effect.acquireRelease(
    Effect.callback<{
      readonly url: string;
      readonly received: Array<Received>;
      close: () => void;
    }>((resume) => {
      const received: Array<Received> = [];
      const server = createServer((request, response) => {
        const chunks: Array<Buffer> = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          received.push({
            url: request.url,
            headers: request.headers,
            body: Buffer.concat(chunks),
          });
          response.writeHead(status, headers);
          response.end();
        });
      });
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo;
        resume(
          Effect.succeed({
            url: `http://127.0.0.1:${port}`,
            received,
            close: () => void server.close(),
          }),
        );
      });
    }),
    (service) => Effect.sync(() => service.close()),
  );

/** A device's subscription with real keys, as a browser makes them. */
const deviceAt = (endpoint: string): PushSubscription => {
  const device = createECDH('prime256v1');
  device.generateKeys();
  return {
    endpoint,
    keys: {
      p256dh: device.getPublicKey('base64url', 'uncompressed'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
};

const notification: Notification = {
  title: 'kirk needs you',
  body: 'app\nWhich stack?',
  tag: 'w1:p1',
  url: '/agents/kirk?from=push',
};

// Records each log line's level and message.
const logs = (() => {
  const records: Array<{
    readonly level: string;
    readonly message: unknown;
    readonly text: string;
  }> = [];
  const logger = Logger.make((options) => {
    const { message, logLevel } = options;
    records.push({
      level: logLevel,
      message: Array.isArray(message) && message.length === 1 ? message[0] : message,
      text: Logger.formatLogFmt.log(options),
    });
  });
  return { records, layer: Logger.layer([logger], { mergeWithExisting: false }) };
})();

const sender = PushSenderOutbound.pipe(
  Effect.provide(
    layerWebPush({ subject: 'https://example.test/pocket-comms', timeout: '2 seconds' }).pipe(
      Layer.provide(
        Layer.fresh(layerFile({ stateDir: join(mkdtempSync(join(tmpdir(), 'comms-push-')), 's') })),
      ),
    ),
  ),
);

describe('the web push sender', () => {
  it.effect('sends an encrypted push that the VAPID key signs', () =>
    Effect.gen(function* () {
      const service = yield* fakePushService(201);
      const outbound = yield* sender;

      const outcome = yield* outbound.send(deviceAt(`${service.url}/device`), notification);

      expect(outcome).toBe('sent');
      const [request] = service.received;
      expect(request?.url).toBe('/device');
      expect(request?.headers).toMatchObject({
        ttl: '3600',
        urgency: 'high',
        'content-encoding': 'aes128gcm',
      });
      expect(request?.headers.authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/u);
      expect(request?.body.toString('utf-8')).not.toContain('kirk');
    }).pipe(Effect.scoped),
  );

  it.effect('reports a subscription the push service no longer knows as gone', () =>
    Effect.gen(function* () {
      const outbound = yield* sender;

      for (const status of [404, 410]) {
        const service = yield* fakePushService(status);
        expect(yield* outbound.send(deviceAt(`${service.url}/device`), notification)).toBe('gone');
      }
    }).pipe(Effect.scoped),
  );

  it.effect('logs any other answer and does not follow a redirect', () =>
    Effect.gen(function* () {
      const outbound = yield* sender;
      const elsewhere = yield* fakePushService(201);
      const failing = yield* fakePushService(500);
      const moved = yield* fakePushService(301, { location: `${elsewhere.url}/device` });
      logs.records.length = 0;

      const outcomes = [
        yield* outbound.send(deviceAt(`${failing.url}/device`), notification),
        yield* outbound.send(deviceAt(`${moved.url}/device`), notification),
      ];

      expect(outcomes).toEqual(['sent', 'sent']);
      expect(elsewhere.received).toEqual([]);
      expect(logs.records.map((record) => [record.level, record.message])).toEqual([
        ['Warn', 'A push was not taken'],
        ['Warn', 'A push was not taken'],
      ]);
    }).pipe(Effect.scoped, Effect.provide(logs.layer)),
  );

  it.effect('logs a device whose keys cannot encrypt a push, without its address', () =>
    Effect.gen(function* () {
      const outbound = yield* sender;
      logs.records.length = 0;
      const device = deviceAt('https://push.example/secret-device');

      const outcome = yield* outbound.send(
        { ...device, keys: { ...device.keys, p256dh: 'short' } },
        notification,
      );

      expect(outcome).toBe('sent');
      expect(logs.records.map((record) => [record.level, record.message])).toEqual([
        ['Warn', 'A push was not sent'],
      ]);
      expect(logs.records[0]?.text).not.toContain('secret-device');
    }).pipe(Effect.provide(logs.layer)),
  );

  it.effect('keeps the address of a device out of the log when it is not a URL', () =>
    Effect.gen(function* () {
      const outbound = yield* sender;
      logs.records.length = 0;

      yield* outbound.send(deviceAt('https://:secret-device'), notification);

      expect(logs.records.map((record) => record.message)).toEqual(['A push was not sent']);
      expect(logs.records[0]?.text).not.toContain('secret-device');
    }).pipe(Effect.provide(logs.layer)),
  );

  it.effect('logs a push service that cannot be reached', () =>
    Effect.gen(function* () {
      const outbound = yield* sender;
      logs.records.length = 0;

      const outcome = yield* outbound.send(deviceAt('http://127.0.0.1:1/device'), notification);

      expect(outcome).toBe('sent');
      expect(logs.records.map((record) => record.message)).toEqual(['A push was not sent']);
    }).pipe(Effect.provide(logs.layer)),
  );
});
