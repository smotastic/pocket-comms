import { PushSenderOutbound, type PushOutcome } from '@pocket-comms/comms-application';
import type { Notification, PushSubscription } from '@pocket-comms/comms-domain';
import type * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import webpush from 'web-push';
import { VapidKeys } from './file-store.js';

// Sends Web Push with the `web-push` library, which encrypts the payload and signs the request
// with the server's VAPID key. The request itself goes through `fetch`, so a redirect is never
// followed to another address.

export interface WebPushOptions {
  /** Who runs this server, as push services ask: an `https:` or `mailto:` address. */
  readonly subject: string;
  readonly timeout?: Duration.Input;
}

/** An hour: a notification about an agent that waited longer than that is stale. */
const TTL_SECONDS = 3600;

// Library and fetch errors can quote the endpoint, which is the device's address, so the log
// gets only a fixed reason or an error code.
const codeOf = (error: unknown) =>
  error instanceof Error && error.cause instanceof Error && 'code' in error.cause
    ? String(error.cause.code)
    : undefined;

export const layerWebPush = ({ subject, timeout = '10 seconds' }: WebPushOptions) =>
  Layer.effect(
    PushSenderOutbound,
    Effect.gen(function* () {
      const vapidKeys = yield* VapidKeys;

      const send = (subscription: PushSubscription, notification: Notification) =>
        Effect.gen(function* () {
          const keys = yield* vapidKeys.keys;
          const request = yield* Effect.try({
            try: () =>
              webpush.generateRequestDetails(
                { endpoint: subscription.endpoint, keys: { ...subscription.keys } },
                JSON.stringify(notification),
                {
                  vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
                  TTL: TTL_SECONDS,
                  urgency: 'high',
                },
              ),
            catch: () => 'the push could not be prepared for this device',
          });
          const response = yield* Effect.tryPromise({
            try: (signal) =>
              fetch(request.endpoint, {
                method: request.method,
                headers: request.headers,
                body: request.body === null ? null : new Uint8Array(request.body),
                redirect: 'manual',
                signal,
              }),
            catch: (error) => `the push service cannot be reached (${codeOf(error) ?? 'no code'})`,
          }).pipe(
            Effect.timeoutOrElse({
              duration: timeout,
              orElse: () => Effect.fail('the push service did not answer in time'),
            }),
          );
          // Only the status matters; the body is dropped so the connection is free again.
          yield* Effect.promise(() => response.body?.cancel() ?? Promise.resolve());
          if (response.status === 404 || response.status === 410) return 'gone' as const;
          if (!response.ok) {
            yield* Effect.logWarning('A push was not taken').pipe(
              Effect.annotateLogs({ status: response.status }),
            );
          }
          return 'sent' as const;
        }).pipe(
          // Nothing to retry: the next change sends again.
          Effect.catch((error) =>
            Effect.logWarning('A push was not sent').pipe(
              Effect.annotateLogs({
                reason: typeof error === 'string' ? error : (error.reason ?? 'unknown'),
              }),
              Effect.as<PushOutcome>('sent'),
            ),
          ),
          Effect.withSpan('PushSender.send'),
        );

      return PushSenderOutbound.of({ send });
    }),
  );
