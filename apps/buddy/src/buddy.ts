import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Queue from 'effect/Queue';
import * as Ref from 'effect/Ref';
import * as Stream from 'effect/Stream';
import { Button, type Intent } from './button.js';
import { Outbox } from './outbox.js';
import { Recorder, type Recording } from './recorder.js';
import { Screen } from './screen.js';
import { initialState, render, type BuddyState } from './view.js';

// The buddy's program over its ports: it records what the owner says, sends it to the brainstorm
// chat, follows Pi's answer and keeps the screen current. It ends when the owner quits.

/** A recording ends by itself after two minutes. */
export const MAX_RECORDING_MILLIS = 120_000;
/** A shorter clip is a slip of the button, not something said. */
export const MIN_CLIP_MILLIS = 500;

/** What the recording part reacts to: the owner, or the limit of one recording. */
type Event = Intent | { readonly _tag: 'Limit'; readonly recording: number };

export const buddy = Effect.scoped(
  Effect.gen(function* () {
    const button = yield* Button;
    const screen = yield* Screen;
    const recorder = yield* Recorder;
    const outbox = yield* Outbox;
    const state = yield* Ref.make<BuddyState>(initialState);

    // One fiber draws the screen, so views never overtake each other; a change only marks it.
    const dirty = yield* Queue.sliding<void>(1);
    const update = (change: (current: BuddyState) => BuddyState) =>
      Ref.update(state, change).pipe(Effect.andThen(Queue.offer(dirty, undefined)));
    yield* Effect.forkScoped(
      Effect.forever(
        Effect.gen(function* () {
          yield* Queue.take(dirty);
          const now = yield* Clock.currentTimeMillis;
          yield* screen.show(render(yield* Ref.get(state), now));
        }),
      ),
    );
    yield* Queue.offer(dirty, undefined);

    // The running time of a recording moves on the screen every second.
    yield* Effect.forkScoped(
      Effect.forever(
        Effect.sleep(1000).pipe(
          Effect.andThen(Ref.get(state)),
          Effect.flatMap((current) =>
            current.status._tag === 'Recording' ? Queue.offer(dirty, undefined) : Effect.void,
          ),
        ),
      ),
    );

    // ── Recording ──────────────────────────────────────────────────────────────────────────
    const limits = yield* Queue.unbounded<Event>();
    let current:
      | { readonly recording: Recording; readonly startedAt: number; readonly number: number }
      | undefined;
    let recordings = 0;

    const start = Effect.gen(function* () {
      if (current !== undefined) return;
      const started = yield* recorder.start.pipe(Effect.result);
      if (started._tag === 'Failure') {
        yield* update((s) => ({ ...s, notice: started.failure.reason }));
        return;
      }
      const startedAt = yield* Clock.currentTimeMillis;
      const number = ++recordings;
      current = { recording: started.success, startedAt, number };
      yield* update((s) => ({ ...s, status: { _tag: 'Recording', startedAt }, notice: undefined }));
      yield* Effect.forkScoped(
        Effect.sleep(MAX_RECORDING_MILLIS).pipe(
          Effect.andThen(Queue.offer(limits, { _tag: 'Limit', recording: number })),
        ),
      );
    });

    const stop = Effect.gen(function* () {
      const ending = current;
      if (ending === undefined) return;
      current = undefined;
      const bytes = yield* ending.recording.stop.pipe(Effect.result);
      const length = (yield* Clock.currentTimeMillis) - ending.startedAt;
      if (bytes._tag === 'Failure') {
        yield* update((s) => ({ ...s, status: { _tag: 'Ready' }, notice: bytes.failure.reason }));
        return;
      }
      if (length >= MIN_CLIP_MILLIS) yield* outbox.put(bytes.success);
      yield* update((s) => ({ ...s, status: { _tag: 'Ready' } }));
    });

    const react = (event: Event) => {
      switch (event._tag) {
        case 'Press':
          return start;
        case 'Release':
          return stop;
        case 'Limit':
          return current?.number === event.recording ? stop : Effect.void;
        case 'Create':
        case 'Discard':
        case 'Quit':
          return Effect.void;
      }
    };

    yield* button.intents.pipe(
      Stream.takeWhile((intent) => intent._tag !== 'Quit'),
      Stream.merge(Stream.fromQueue(limits), { haltStrategy: 'left' }),
      Stream.runForEach(react),
    );
    // A recording under way when the owner quits is kept, not lost.
    yield* stop;
  }),
);
