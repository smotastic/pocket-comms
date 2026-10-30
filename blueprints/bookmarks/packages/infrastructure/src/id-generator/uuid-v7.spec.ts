import { describe, expect, it } from '@effect/vitest';
import { IdGeneratorOutbound } from '@pocket-comms/bookmarks-application';
import * as Effect from 'effect/Effect';
import { TestClock } from 'effect/testing';
import { IdGenerator } from '../index.js';

const next = IdGeneratorOutbound.use((idGeneratorOutbound) => idGeneratorOutbound.next);

describe('IdGenerator.layerUuidV7', () => {
  it.effect('issues version 7 UUIDs that carry the current time', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse('2026-09-29T08:00:00Z'));
      const id = yield* next;
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      const millis = Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16);
      expect(millis).toBe(Date.parse('2026-09-29T08:00:00Z'));
    }).pipe(Effect.provide(IdGenerator.layerUuidV7)),
  );

  it.effect('issues ids that sort by creation time', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(1_000);
      const earlier = yield* next;
      yield* TestClock.setTime(2_000);
      const later = yield* next;
      expect(earlier < later).toBe(true);
    }).pipe(Effect.provide(IdGenerator.layerUuidV7)),
  );
});
