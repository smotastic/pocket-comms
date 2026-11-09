import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Queue from 'effect/Queue';
import * as Stream from 'effect/Stream';
import { Button, type Intent } from './button.js';
import { Comms, type BrainstormEventView, type CommsError, type Decision } from './comms.js';
import { Outbox, type Clip } from './outbox.js';
import { Recorder, RecorderError } from './recorder.js';
import { Screen, type ScreenView } from './screen.js';

// Fakes of the buddy's ports, for tests of the core: each keeps what it was asked in plain fields.

/** One item of the fake event stream: an event, or the stream failing with an error. */
export type FakeStreamItem = BrainstormEventView | { readonly fail: CommsError };

export const makeFakes = Effect.gen(function* () {
  const intents = yield* Queue.unbounded<Intent>();
  const stream = yield* Queue.unbounded<FakeStreamItem>();
  const fake = {
    intents,
    stream,
    views: [] as Array<ScreenView>,
    recorder: { recording: false, started: 0, failure: undefined as string | undefined },
    outbox: [] as Array<Clip>,
    nextClip: 0,
    comms: {
      answering: false,
      /** What each clip is transcribed to, by its first byte; `text` otherwise. */
      text: 'dark mode for pocket-home',
      /** Failures for the next calls, in order, before they succeed. */
      transcribeFailures: [] as Array<CommsError>,
      sendFailures: [] as Array<CommsError>,
      decideFailures: [] as Array<CommsError>,
      transcribed: [] as Array<Uint8Array>,
      sent: [] as Array<string>,
      decisions: [] as Array<[string, Decision]>,
      /** The `after` of each time the events were followed. */
      followed: [] as Array<number>,
    },
  };

  const failNext = (failures: Array<CommsError>) =>
    Effect.suspend(() => {
      const failure = failures.shift();
      return failure === undefined ? Effect.void : Effect.fail(failure);
    });

  const layer = Layer.mergeAll(
    Layer.succeed(Button, { intents: Stream.fromQueue(intents) }),
    Layer.succeed(Recorder, {
      start: Effect.suspend(() => {
        if (fake.recorder.failure !== undefined) {
          return Effect.fail(new RecorderError({ reason: fake.recorder.failure }));
        }
        fake.recorder.recording = true;
        fake.recorder.started += 1;
        const bytes = Uint8Array.from([fake.recorder.started]);
        return Effect.succeed({
          stop: Effect.sync(() => {
            fake.recorder.recording = false;
            return bytes;
          }),
        });
      }),
    }),
    Layer.succeed(Screen, { show: (view) => Effect.sync(() => void fake.views.push(view)) }),
    Layer.succeed(Outbox, {
      put: (bytes) =>
        Effect.sync(() => {
          const clip = { id: `clip-${fake.nextClip++}`, bytes };
          fake.outbox.push(clip);
          return clip;
        }),
      oldest: Effect.sync(() => Option.fromNullishOr(fake.outbox[0])),
      remove: (id) =>
        Effect.sync(() => {
          fake.outbox = fake.outbox.filter((clip) => clip.id !== id);
        }),
      size: Effect.sync(() => fake.outbox.length),
    }),
    Layer.succeed(Comms, {
      transcribe: (clip) =>
        failNext(fake.comms.transcribeFailures).pipe(
          Effect.andThen(
            Effect.sync(() => {
              fake.comms.transcribed.push(clip);
              return fake.comms.text;
            }),
          ),
        ),
      send: (text) =>
        failNext(fake.comms.sendFailures).pipe(
          Effect.andThen(Effect.sync(() => void fake.comms.sent.push(text))),
        ),
      answering: Effect.sync(() => fake.comms.answering),
      events: (after) =>
        Stream.unwrap(
          Effect.sync(() => {
            fake.comms.followed.push(after);
            return Stream.fromQueue(stream).pipe(
              Stream.mapEffect((item) =>
                'fail' in item ? Effect.fail(item.fail) : Effect.succeed(item),
              ),
            );
          }),
        ),
      decide: (proposal, decision) =>
        failNext(fake.comms.decideFailures).pipe(
          Effect.andThen(Effect.sync(() => void fake.comms.decisions.push([proposal, decision]))),
        ),
    }),
  );

  return { fake, layer };
});

/** Lets the buddy's fibers run until they wait on something. */
export const settle = Effect.gen(function* () {
  for (let round = 0; round < 50; round++) yield* Effect.yieldNow;
});
