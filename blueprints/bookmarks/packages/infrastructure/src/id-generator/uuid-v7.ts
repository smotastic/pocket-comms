import { IdGeneratorOutbound } from '@pocket-comms/bookmarks-application';
import { BookmarkId } from '@pocket-comms/bookmarks-domain';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { randomBytes } from 'node:crypto';

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

// RFC 9562 UUIDv7: 48 bits of Unix milliseconds, then random bits with the version and variant
// set. Ids of different milliseconds sort by time; inside one millisecond their order is random
// but fixed, which is enough for the list tie-breaker.
const uuidV7 = (millis: number) => {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(millis, 0, 6);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/** A new UUIDv7 at the time of the Effect clock. */
export const nextUuidV7 = Effect.map(Clock.currentTimeMillis, uuidV7);

export const layerUuidV7 = Layer.succeed(IdGeneratorOutbound, {
  next: Effect.map(nextUuidV7, BookmarkId.make),
});
