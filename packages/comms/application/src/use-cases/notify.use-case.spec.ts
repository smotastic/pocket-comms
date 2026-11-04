import { describe, expect, it } from '@effect/vitest';
import type { Agent, BackgroundItem } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as PubSub from 'effect/PubSub';
import { TestClock } from 'effect/testing';
import { PushInbound } from '../ports/push.inbound.port.js';
import { fakeAgent, fakeLayer, FakeState, fakeSubscription } from '../testing/fakes.js';
import { settle } from '../testing/streams.js';

const layer = () => PushInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

/** Herdr now reports `agents`, and the watcher has read them. */
const herdrSays = (agents: ReadonlyArray<Agent>) =>
  Effect.gen(function* () {
    const state = yield* FakeState;
    state.agents = [...agents];
    yield* PubSub.publish(state.herdrChanges, undefined);
    yield* settle;
  });

/** Starts the watcher with one subscribed phone and a first reading of `agents`. */
const watching = (agents: ReadonlyArray<Agent>) =>
  Effect.gen(function* () {
    const state = yield* FakeState;
    state.pushSubscriptions = [fakeSubscription('phone')];
    yield* PushInbound.use((inbound) => inbound.watch).pipe(Effect.forkScoped);
    yield* settle;
    yield* herdrSays(agents);
    return state;
  });

const working = fakeAgent({ paneId: 'w1:p1', name: 'kirk', status: 'working', completion: 1 });
const blocked = { ...working, status: 'blocked' } as const;
const done = { ...working, status: 'done', completion: 2 } as const;

const titles = (state: FakeState['Service']) => state.pushes.map((push) => push.notification.title);

describe('PushInbound.watch', () => {
  it.effect('notifies an agent that is still blocked 10 seconds after it became blocked', () =>
    Effect.gen(function* () {
      const state = yield* watching([working]);
      yield* herdrSays([blocked]);

      yield* TestClock.adjust('9 seconds');
      expect(state.pushes).toEqual([]);
      yield* TestClock.adjust('1 second');
      yield* settle;

      expect(state.pushes).toEqual([
        {
          endpoint: 'https://push.example/phone',
          notification: {
            title: 'kirk needs you',
            body: 'app',
            tag: 'w1:p1',
            url: '/agents/kirk?from=push',
          },
          at: 10_000,
        },
      ]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('sends nothing for an agent that went on within 10 seconds', () =>
    Effect.gen(function* () {
      const state = yield* watching([working]);
      yield* herdrSays([blocked]);
      yield* TestClock.adjust('5 seconds');
      yield* herdrSays([working]);

      yield* TestClock.adjust('1 minute');
      yield* settle;

      expect(state.pushes).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('sends nothing for agents that already waited when the watcher started', () =>
    Effect.gen(function* () {
      const spock = { ...done, paneId: 'w1:p2', name: 'spock' };
      const state = yield* watching([blocked, spock]);
      yield* TestClock.adjust('1 minute');
      yield* herdrSays([blocked, { ...spock, completion: 3 }]);

      yield* TestClock.adjust('10 seconds');
      yield* settle;

      expect(titles(state)).toEqual(['spock is done']);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('notifies once per blocked spell', () =>
    Effect.gen(function* () {
      const state = yield* watching([working]);
      yield* herdrSays([blocked]);
      yield* TestClock.adjust('10 seconds');
      yield* herdrSays([blocked]);
      yield* TestClock.adjust('1 minute');
      yield* herdrSays([working]);
      yield* herdrSays([blocked]);
      yield* TestClock.adjust('10 seconds');
      yield* settle;

      expect(titles(state)).toEqual(['kirk needs you', 'kirk needs you']);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('notifies a finished turn the owner did not look at, with its last message', () =>
    Effect.gen(function* () {
      const state = yield* watching([{ ...working, session: 's1' }]);
      state.transcripts.set('s1', {
        entries: [{ type: 'assistant', id: 'a1', at: 1, text: 'All tests pass.' }],
        modifiedAt: 1,
      });
      yield* herdrSays([{ ...done, session: 's1' }]);

      yield* TestClock.adjust('10 seconds');
      yield* settle;

      expect(state.pushes.map((push) => push.notification)).toEqual([
        {
          title: 'kirk is done',
          body: 'app\nAll tests pass.',
          tag: 'w1:p1',
          url: '/agents/kirk?from=push',
        },
      ]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('sends nothing for a finished turn the owner saw within 10 seconds', () =>
    Effect.gen(function* () {
      const state = yield* watching([working]);
      yield* herdrSays([done]);
      state.seen.add('w1:p1#2');

      yield* TestClock.adjust('10 seconds');
      yield* settle;

      expect(state.pushes).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('notifies only the newest change of an agent', () =>
    Effect.gen(function* () {
      const state = yield* watching([working]);
      yield* herdrSays([{ ...done, completion: 1 }]);
      yield* TestClock.adjust('3 seconds');
      // Herdr counts the completion a moment after the status turned done.
      yield* herdrSays([done]);

      yield* TestClock.adjust('1 minute');
      yield* settle;

      expect(titles(state)).toEqual(['kirk is done']);
      expect(state.pushes[0]?.at).toBe(13_000);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('starts the wait again for a newer change of the same agent', () =>
    Effect.gen(function* () {
      const state = yield* watching([working]);
      yield* herdrSays([blocked]);
      yield* TestClock.adjust('3 seconds');
      yield* herdrSays([working]);
      yield* TestClock.adjust('3 seconds');
      yield* herdrSays([blocked]);

      yield* TestClock.adjust('1 minute');
      yield* settle;

      expect(state.pushes.map((push) => push.at)).toEqual([16_000]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('keeps watching while Herdr is away, and compares with what it saw last', () =>
    Effect.gen(function* () {
      const state = yield* watching([working, { ...blocked, paneId: 'w1:p2', name: 'spock' }]);
      state.available = false;
      yield* herdrSays([]);
      state.available = true;
      yield* herdrSays([blocked, { ...blocked, paneId: 'w1:p2', name: 'spock' }]);

      yield* TestClock.adjust('10 seconds');
      yield* settle;

      expect(titles(state)).toEqual(['kirk needs you']);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('sends nothing when Herdr is away at the end of the wait', () =>
    Effect.gen(function* () {
      const state = yield* watching([working]);
      yield* herdrSays([blocked]);
      state.available = false;

      yield* TestClock.adjust('1 minute');
      yield* settle;

      expect(state.pushes).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('notifies every device and forgets one whose subscription is gone', () =>
    Effect.gen(function* () {
      const state = yield* watching([working]);
      state.pushSubscriptions = [fakeSubscription('phone'), fakeSubscription('laptop')];
      state.goneEndpoints.add('https://push.example/laptop');
      yield* herdrSays([blocked]);

      yield* TestClock.adjust('10 seconds');
      yield* settle;

      expect(state.pushes.map((push) => push.endpoint)).toEqual(['https://push.example/phone']);
      expect(state.pushSubscriptions).toEqual([fakeSubscription('phone')]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('still notifies the other devices when a gone one cannot be forgotten', () =>
    Effect.gen(function* () {
      const state = yield* watching([working]);
      state.pushSubscriptions = [fakeSubscription('laptop'), fakeSubscription('phone')];
      state.goneEndpoints.add('https://push.example/laptop');
      state.pushRemoveFailure = 'EACCES';
      yield* herdrSays([blocked]);

      yield* TestClock.adjust('10 seconds');
      yield* settle;
      state.pushRemoveFailure = undefined;
      yield* herdrSays([working]);
      yield* herdrSays([blocked]);
      yield* TestClock.adjust('10 seconds');
      yield* settle;

      expect(state.pushes.map((push) => push.endpoint)).toEqual([
        'https://push.example/phone',
        'https://push.example/phone',
      ]);
      expect(state.pushSubscriptions).toEqual([fakeSubscription('phone')]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('keeps watching when the devices cannot be read', () =>
    Effect.gen(function* () {
      const state = yield* watching([working]);
      state.pushStoreFailure = 'EACCES';
      yield* herdrSays([blocked]);
      yield* TestClock.adjust('10 seconds');
      yield* settle;
      state.pushStoreFailure = undefined;
      yield* herdrSays([working]);
      yield* herdrSays([blocked]);

      yield* TestClock.adjust('10 seconds');
      yield* settle;

      expect(titles(state)).toEqual(['kirk needs you']);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('names the open question of a blocked agent', () =>
    Effect.gen(function* () {
      const state = yield* watching([{ ...working, session: 's1' }]);
      state.transcripts.set('s1', {
        entries: [
          {
            type: 'tool',
            id: 't1',
            at: 1,
            verb: 'Used',
            questions: [{ text: 'Which stack?' }],
            outcome: 'pending',
          },
        ],
        modifiedAt: 1,
      });
      yield* herdrSays([{ ...blocked, session: 's1' }]);

      yield* TestClock.adjust('10 seconds');
      yield* settle;

      expect(state.pushes[0]?.notification.body).toBe('app\nWhich stack?');
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );
});

describe('PushInbound.watch with background work (spec 020)', () => {
  const shell: BackgroundItem = {
    id: 'toolu-ci',
    kind: 'shell',
    description: 'Wait for CI',
    startedAt: 0,
    inBackground: true,
  };
  const kirk = { ...working, session: 's1' };
  const kirkDone = { ...done, session: 's1' };

  /** The agent's session now has `background` running. */
  const running = (background: ReadonlyArray<BackgroundItem>) =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.transcripts.set('s1', { entries: [], modifiedAt: 1, background: [...background] });
    });

  it.effect('holds a finished turn while its background work runs', () =>
    Effect.gen(function* () {
      const state = yield* watching([kirk]);
      yield* running([shell]);
      yield* herdrSays([kirkDone]);

      yield* TestClock.adjust('10 seconds');
      yield* settle;
      expect(state.pushes).toEqual([]);
      yield* TestClock.adjust('1 hour');
      yield* settle;

      expect(state.pushes).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('notifies once the agent has been quiet for 10 seconds after its work ended', () =>
    Effect.gen(function* () {
      const state = yield* watching([kirk]);
      yield* running([shell]);
      yield* herdrSays([kirkDone]);
      yield* TestClock.adjust('25 seconds');
      yield* running([]);

      yield* TestClock.adjust('9 seconds');
      yield* settle;
      expect(state.pushes).toEqual([]);
      yield* TestClock.adjust('1 minute');
      yield* settle;

      expect(titles(state)).toEqual(['kirk is done']);
      expect(state.pushes[0]?.at).toBe(40_000);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('notifies only the turn the agent ran after its work ended', () =>
    Effect.gen(function* () {
      const state = yield* watching([kirk]);
      yield* running([shell]);
      yield* herdrSays([kirkDone]);
      yield* TestClock.adjust('25 seconds');
      yield* running([]);
      yield* herdrSays([{ ...kirkDone, status: 'working' }]);
      yield* TestClock.adjust('20 seconds');
      yield* herdrSays([{ ...kirkDone, completion: 3 }]);

      yield* TestClock.adjust('1 minute');
      yield* settle;

      expect(titles(state)).toEqual(['kirk is done']);
      expect(state.pushes[0]?.at).toBe(55_000);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('sends nothing for a turn the owner saw while its work ran', () =>
    Effect.gen(function* () {
      const state = yield* watching([kirk]);
      yield* running([shell]);
      yield* herdrSays([kirkDone]);
      yield* TestClock.adjust('25 seconds');
      state.seen.add('w1:p1#2');
      yield* running([]);

      yield* TestClock.adjust('1 minute');
      yield* settle;

      expect(state.pushes).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('holds the turn again when new work starts within the quiet 10 seconds', () =>
    Effect.gen(function* () {
      const state = yield* watching([kirk]);
      yield* running([shell]);
      yield* herdrSays([kirkDone]);
      yield* TestClock.adjust('25 seconds');
      yield* running([]);
      yield* TestClock.adjust('10 seconds');
      yield* running([{ ...shell, id: 'toolu-deploy', startedAt: 35_000 }]);

      yield* TestClock.adjust('1 minute');
      yield* settle;

      expect(state.pushes).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('notifies a blocked agent after 10 seconds, whatever runs in the background', () =>
    Effect.gen(function* () {
      const state = yield* watching([kirk]);
      yield* running([shell]);
      yield* herdrSays([{ ...blocked, session: 's1' }]);

      yield* TestClock.adjust('10 seconds');
      yield* settle;

      expect(titles(state)).toEqual(['kirk needs you']);
      expect(state.pushes[0]?.at).toBe(10_000);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );
});
