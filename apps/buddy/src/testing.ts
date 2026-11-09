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
    /** How long counting the outbox takes, to make overlapping operations visible. */
    sizeMillis: 0,
    /** How many outbox operations ran at once, at most. */
    outboxOverlap: 0,
    comms: {
      answering: false,
      /** What a clip is transcribed to. */
      transcript: (clip: Uint8Array): string => `idea ${clip[0] ?? 0}`,
      /** Failures for the next calls, in order, before they succeed. */
      transcribeFailures: [] as Array<CommsError>,
      sendFailures: [] as Array<CommsError>,
      decideFailures: [] as Array<CommsError>,
      /** Runs when a message is sent, before it answers. */
      onSend: (): void => undefined,
      /** How long a decision takes to answer. */
      decideMillis: 0,
      transcribed: [] as Array<Uint8Array>,
      sent: [] as Array<string>,
      decisions: [] as Array<[string, Decision]>,
      /** Every decision asked for, also those that failed. */
      decided: [] as Array<string>,
      /** The `after` of each time the events were followed. */
      followed: [] as Array<number>,
    },
  };

  let inFlight = 0;
  const tracked = <A, E>(operation: Effect.Effect<A, E>) =>
    Effect.sync(() => {
      inFlight += 1;
      fake.outboxOverlap = Math.max(fake.outboxOverlap, inFlight);
    }).pipe(Effect.andThen(operation), Effect.ensuring(Effect.sync(() => (inFlight -= 1))));

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
        tracked(
          Effect.sync(() => {
            const clip = { id: `clip-${fake.nextClip++}`, bytes };
            fake.outbox.push(clip);
            return clip;
          }),
        ),
      oldest: Effect.sync(() => Option.fromNullishOr(fake.outbox[0])),
      remove: (id) =>
        tracked(
          Effect.sync(() => {
            fake.outbox = fake.outbox.filter((clip) => clip.id !== id);
          }),
        ),
      size: tracked(
        Effect.sync(() => fake.outbox.length).pipe(
          Effect.tap(() => (fake.sizeMillis > 0 ? Effect.sleep(fake.sizeMillis) : Effect.void)),
        ),
      ),
    }),
    Layer.succeed(Comms, {
      transcribe: (clip) =>
        failNext(fake.comms.transcribeFailures).pipe(
          Effect.andThen(
            Effect.sync(() => {
              fake.comms.transcribed.push(clip);
              return fake.comms.transcript(clip);
            }),
          ),
        ),
      send: (text) =>
        Effect.sync(() => fake.comms.onSend()).pipe(
          Effect.andThen(failNext(fake.comms.sendFailures)),
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
        Effect.sync(() => void fake.comms.decided.push(proposal)).pipe(
          Effect.andThen(Effect.suspend(() => Effect.sleep(fake.comms.decideMillis))),
          Effect.andThen(failNext(fake.comms.decideFailures)),
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
