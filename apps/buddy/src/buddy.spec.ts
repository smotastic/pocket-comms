import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Queue from 'effect/Queue';
import { TestClock } from 'effect/testing';
import { buddy } from './buddy.js';
import { Busy, Failed, NotSetUp, Refused, Unreachable } from './comms.js';
import { makeFakes, settle } from './testing.js';

type Fake = Effect.Success<typeof makeFakes>['fake'];

/** Runs the buddy on fakes; `before` sets them up, `body` drives it, then the owner quits. */
const withBuddy = <A, E>(
  body: (fake: Fake) => Effect.Effect<A, E>,
  before?: (fake: Fake) => void,
) =>
  Effect.gen(function* () {
    const { fake, layer } = yield* makeFakes;
    before?.(fake);
    const running = yield* buddy.pipe(Effect.provide(layer), Effect.forkChild);
    yield* settle;
    const result = yield* body(fake);
    yield* Queue.offer(fake.intents, { _tag: 'Quit' });
    yield* Fiber.join(running);
    return result;
  });

const press = (fake: Effect.Success<typeof makeFakes>['fake'], tag: 'Press' | 'Release') =>
  Queue.offer(fake.intents, { _tag: tag }).pipe(Effect.andThen(settle));

const wait = (millis: number) => TestClock.adjust(millis).pipe(Effect.andThen(settle));

const lastView = (fake: Effect.Success<typeof makeFakes>['fake']) => fake.views.at(-1);

describe('the buddy', () => {
  it.effect('starts ready and stops when the owner quits', () =>
    withBuddy((fake) =>
      Effect.sync(() => {
        expect(lastView(fake)?.status).toBe('Ready');
      }),
    ),
  );
});

describe('recording', () => {
  it.effect('records while the button is held and keeps the clip in the outbox', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        fake.comms.answering = true;
        yield* press(fake, 'Press');
        expect(fake.recorder.recording).toBe(true);
        yield* wait(12_000);
        expect(lastView(fake)?.status).toBe('Recording 0:12');

        yield* press(fake, 'Release');

        expect(fake.recorder.recording).toBe(false);
        expect(fake.outbox.map((clip) => [...clip.bytes])).toEqual([[1]]);
      }),
    ),
  );

  it.effect('drops a clip shorter than half a second as a slip of the button', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        yield* press(fake, 'Press');
        yield* wait(300);
        yield* press(fake, 'Release');

        expect(fake.recorder.recording).toBe(false);
        expect(fake.outbox).toEqual([]);
      }),
    ),
  );

  it.effect('ends a recording by itself after two minutes', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        fake.comms.answering = true;
        yield* press(fake, 'Press');
        yield* wait(119_999);
        expect(fake.recorder.recording).toBe(true);
        yield* wait(1);

        expect(fake.recorder.recording).toBe(false);
        expect(fake.outbox).toHaveLength(1);

        // The release that follows the limit starts nothing.
        yield* press(fake, 'Release');
        expect(fake.recorder.started).toBe(1);
      }),
    ),
  );

  it.effect('says why the microphone did not record', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        fake.recorder.failure = 'ffmpeg is not installed.';

        yield* press(fake, 'Press');

        expect(lastView(fake)?.status).toBe('Ready · ffmpeg is not installed.');
        expect(fake.outbox).toEqual([]);
      }),
    ),
  );

  it.effect('keeps a recording that is under way when the owner quits', () =>
    Effect.gen(function* () {
      const { fake, layer } = yield* makeFakes;
      fake.comms.answering = true;
      const running = yield* buddy.pipe(Effect.provide(layer), Effect.forkChild);
      yield* settle;
      yield* press(fake, 'Press');
      yield* wait(2_000);

      yield* Queue.offer(fake.intents, { _tag: 'Quit' });
      yield* Fiber.join(running);

      expect(fake.recorder.recording).toBe(false);
      expect(fake.outbox).toHaveLength(1);
    }),
  );
});

/** Records one clip of a second. */
const say = (fake: Fake) =>
  press(fake, 'Press').pipe(Effect.andThen(wait(1_000)), Effect.andThen(press(fake, 'Release')));

describe('sending', () => {
  it.effect('has a clip transcribed, sends its words and takes it out of the outbox', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        yield* say(fake);

        expect(fake.comms.sent).toEqual(['idea 1']);
        expect(fake.outbox).toEqual([]);
        expect(lastView(fake)?.sent).toBe('idea 1');
      }),
    ),
  );

  it.effect('sends the clips left from before a restart, oldest first', () =>
    withBuddy(
      (fake) =>
        Effect.sync(() => {
          expect(fake.comms.sent).toEqual(['idea 7', 'idea 8']);
        }),
      (fake) => {
        fake.outbox.push(
          { id: 'a', bytes: Uint8Array.from([7]) },
          { id: 'b', bytes: Uint8Array.from([8]) },
        );
      },
    ),
  );

  it.effect('waits while Pi is answering', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        fake.comms.answering = true;
        yield* say(fake);
        expect(fake.comms.sent).toEqual([]);
        expect(lastView(fake)?.status).toBe('Pi is answering · 1 waiting');

        fake.comms.answering = false;
        yield* wait(2_000);

        expect(fake.comms.sent).toEqual(['idea 1']);
      }),
    ),
  );

  it.effect('keeps the clips while comms cannot be reached, waiting longer each time', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        fake.comms.transcribeFailures.push(
          new Unreachable({ reason: 'No connection.' }),
          new Unreachable({ reason: 'No connection.' }),
        );
        yield* say(fake);
        expect(lastView(fake)?.status).toBe('Offline · 1 waiting');

        yield* wait(2_000);
        expect(fake.comms.sent).toEqual([]);
        yield* wait(3_999);
        expect(fake.comms.sent).toEqual([]);
        yield* wait(1);

        expect(fake.comms.sent).toEqual(['idea 1']);
        expect(lastView(fake)?.status).toBe('Ready');
      }),
    ),
  );

  it.effect('waits at most a minute between tries', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        for (let i = 0; i < 8; i++) {
          fake.comms.transcribeFailures.push(new Unreachable({ reason: 'No connection.' }));
        }
        yield* say(fake);
        // 2, 4, 8, 16, 32, then 60 seconds each.
        yield* wait((2 + 4 + 8 + 16 + 32 + 60 + 60) * 1000);
        expect(fake.comms.sent).toEqual([]);
        yield* wait(60_000);

        expect(fake.comms.sent).toEqual(['idea 1']);
      }),
    ),
  );

  it.effect('does not count a wait for Pi as a failure', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        // The send waits for Pi, then the second clip finds comms gone once.
        fake.comms.sendFailures.push(new Busy());
        yield* say(fake);
        yield* wait(2_000);
        expect(fake.comms.sent).toEqual(['idea 1']);
        fake.comms.transcribeFailures.push(new Unreachable({ reason: 'No connection.' }));
        yield* say(fake);
        yield* wait(2_000);

        expect(fake.comms.sent).toEqual(['idea 1', 'idea 2']);
      }),
    ),
  );

  it.effect('does not transcribe again when the send has to wait for Pi', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        fake.comms.sendFailures.push(new Busy());
        yield* say(fake);
        yield* wait(2_000);

        expect(fake.comms.sent).toEqual(['idea 1']);
        expect(fake.comms.transcribed).toHaveLength(1);
      }),
    ),
  );

  it.effect('drops a clip without words and says so', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        fake.comms.transcript = () => '';
        yield* say(fake);

        expect(fake.comms.sent).toEqual([]);
        expect(fake.outbox).toEqual([]);
        expect(lastView(fake)?.status).toBe('Ready · No speech was heard.');
      }),
    ),
  );

  it.effect('drops a clip comms refuses and says why', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        fake.comms.transcribeFailures.push(
          new Refused({ reason: 'Only audio can be transcribed.' }),
        );
        yield* say(fake);

        expect(fake.outbox).toEqual([]);
        expect(lastView(fake)?.status).toBe('Ready · Only audio can be transcribed.');
      }),
    ),
  );

  it.effect('keeps the clips while the chat or transcription is not set up', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        fake.comms.transcribeFailures.push(
          new NotSetUp({ reason: 'Set COMMS_SPEECH_URL and COMMS_SPEECH_MODEL on the server.' }),
        );
        yield* say(fake);

        expect(fake.outbox).toHaveLength(1);
        expect(lastView(fake)?.status).toBe(
          'Not set up: Set COMMS_SPEECH_URL and COMMS_SPEECH_MODEL on the server. · 1 waiting',
        );
        yield* wait(2_000);
        expect(fake.comms.sent).toEqual(['idea 1']);
      }),
    ),
  );

  it.effect('keeps a clip after any other failure and tries again', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        fake.comms.transcribeFailures.push(
          new Failed({ reason: 'The speech service did not answer in time.' }),
        );
        yield* say(fake);

        expect(lastView(fake)?.status).toBe(
          'Failed: The speech service did not answer in time. · 1 waiting',
        );
        yield* wait(2_000);
        expect(fake.comms.sent).toEqual(['idea 1']);
      }),
    ),
  );
});
