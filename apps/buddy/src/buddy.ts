import * as Clock from 'effect/Clock';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Queue from 'effect/Queue';
import * as Ref from 'effect/Ref';
import * as Semaphore from 'effect/Semaphore';
import * as Stream from 'effect/Stream';
import { Button, type Intent } from './button.js';
import { applyEvent } from './chat.js';
import { Comms, type CommsError, type Decision } from './comms.js';
import { Outbox } from './outbox.js';
import { Recorder, type Recording } from './recorder.js';
import { Screen } from './screen.js';
import { initialState, render, type BuddyState, type Link } from './view.js';

// The buddy's program over its ports: it records what the owner says, sends it to the brainstorm
// chat, follows Pi's answer and keeps the screen current. It ends when the owner quits.

/** A recording ends by itself after two minutes. */
export const MAX_RECORDING_MILLIS = 120_000;
/** A shorter clip is a slip of the button, not something said. */
export const MIN_CLIP_MILLIS = 500;

/** The first wait after a failed try; each further one doubles, up to a minute. */
export const FIRST_RETRY_MILLIS = 2_000;
export const LAST_RETRY_MILLIS = 60_000;
/** How long the next message waits before asking again whether Pi is done. */
export const PI_WAIT_MILLIS = 2_000;
/** The outbox is looked at this often even without a new clip, such as one put in by hand. */
const OUTBOX_POLL_MILLIS = 5_000;

/** What the recording part reacts to: the owner, or the limit of one recording. */
type Event = Intent | { readonly _tag: 'Limit'; readonly recording: number };

export const buddy = Effect.scoped(
  Effect.gen(function* () {
    const button = yield* Button;
    const screen = yield* Screen;
    const recorder = yield* Recorder;
    const outbox = yield* Outbox;
    const comms = yield* Comms;
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
            current.recordingSince === undefined ? Effect.void : Queue.offer(dirty, undefined),
          ),
        ),
      ),
    );

    // A new clip wakes the sender at once.
    const wake = yield* Queue.sliding<void>(1);
    // A change of the outbox and the count on the screen happen as one, so an older count never
    // overwrites a newer one.
    const outboxLock = yield* Semaphore.make(1);
    const withCount = <A, E>(change: Effect.Effect<A, E>) =>
      change.pipe(
        Effect.tap(() =>
          outbox.size.pipe(Effect.flatMap((waiting) => update((s) => ({ ...s, waiting })))),
        ),
        Semaphore.withPermit(outboxLock),
      );
    const countWaiting = withCount(Effect.void);

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
      yield* update((s) => ({ ...s, recordingSince: startedAt, notice: undefined }));
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
        yield* update((s) => ({ ...s, recordingSince: undefined, notice: bytes.failure.reason }));
        return;
      }
      yield* update((s) => ({ ...s, recordingSince: undefined }));
      if (length < MIN_CLIP_MILLIS) return;
      yield* withCount(outbox.put(bytes.success));
      yield* Queue.offer(wake, undefined);
    });

    // ── Following the chat ─────────────────────────────────────────────────────────────────
    // The proposals the buddy decided itself, so it can tell how they ended.
    const decidedHere = new Set<string>();
    yield* Effect.forkScoped(
      Effect.gen(function* () {
        let after = 0;
        let retry = FIRST_RETRY_MILLIS;
        for (;;) {
          yield* comms.events(after).pipe(
            Stream.runForEach((event) =>
              Effect.gen(function* () {
                if (event.kind === 'entry') after = event.sequence;
                retry = FIRST_RETRY_MILLIS;
                yield* update((s) => applyEvent(s, event, decidedHere));
              }),
            ),
            Effect.ignore,
          );
          yield* Effect.sleep(Duration.millis(retry));
          retry = Math.min(retry * 2, LAST_RETRY_MILLIS);
        }
      }),
    );

    /** Creates or discards the proposal on the screen, when the buddy may decide it. */
    const decide = (
      decision: (proposal: { project: string; title: string; body: string }) => Decision,
    ) =>
      Effect.gen(function* () {
        const shown = (yield* Ref.get(state)).proposals.at(-1);
        // A proposal is decided once: a second press while the first is on its way, or before
        // comms reports the outcome, asks nothing, so only this request can undo the mark.
        if (shown?.kind !== 'issue' || decidedHere.has(shown.id)) return;
        decidedHere.add(shown.id);
        const result = yield* comms.decide(shown.id, decision(shown)).pipe(Effect.result);
        if (result._tag === 'Failure') {
          decidedHere.delete(shown.id);
          const failure = result.failure;
          yield* update((s) => ({
            ...s,
            notice: failure._tag === 'Busy' ? 'Pi is still answering.' : failure.reason,
          }));
        }
      }).pipe(Effect.forkScoped, Effect.asVoid);

    const react = (event: Event) => {
      switch (event._tag) {
        case 'Press':
          return start;
        case 'Release':
          return stop;
        case 'Toggle':
          return Effect.suspend(() => (current === undefined ? start : stop));
        case 'Limit':
          return current?.number === event.recording ? stop : Effect.void;
        case 'Create':
          return decide(({ project, title, body }) => ({
            _tag: 'Create',
            draft: { project, title, body },
          }));
        case 'Discard':
          return decide(() => ({ _tag: 'Discard' }));
        case 'Quit':
          return Effect.void;
      }
    };

    // ── Sending ────────────────────────────────────────────────────────────────────────────
    // Words already transcribed, by clip, so a send that has to wait does not transcribe again.
    const transcripts = new Map<string, string>();
    const setLink = (link: Link) => update((s) => ({ ...s, link }));

    /** Sends the oldest clip; answers whether there was one. */
    const sendOldest = Effect.gen(function* () {
      const oldest = yield* outbox.oldest;
      if (Option.isNone(oldest)) return false;
      const clip = oldest.value;
      if (yield* comms.answering) {
        yield* setLink({ _tag: 'PiAnswering' });
        yield* Effect.sleep(PI_WAIT_MILLIS);
        return true;
      }
      yield* setLink({ _tag: 'Sending' });
      const text = transcripts.get(clip.id) ?? (yield* comms.transcribe(clip.bytes));
      transcripts.set(clip.id, text);
      if (text === '') {
        yield* forget(clip.id);
        yield* update((s) => ({ ...s, link: { _tag: 'Idle' }, notice: 'No speech was heard.' }));
        return true;
      }
      yield* comms.send(text);
      yield* forget(clip.id);
      yield* update((s) => ({ ...s, link: { _tag: 'Idle' }, sent: text, notice: undefined }));
      return true;
    });

    const forget = (id: string) =>
      withCount(outbox.remove(id)).pipe(Effect.andThen(Effect.sync(() => transcripts.delete(id))));

    /** A wait after a failed try: Pi's turn, or a backoff that grows with each failure. */
    type Pause = 'none' | 'pi' | 'backoff';

    /** What a failed try means for the clip, and how to wait before the next. */
    const afterFailure = (error: CommsError): Effect.Effect<Pause> => {
      switch (error._tag) {
        case 'Busy':
          return setLink({ _tag: 'PiAnswering' }).pipe(Effect.as('pi'));
        case 'Refused':
          return Effect.gen(function* () {
            const oldest = yield* outbox.oldest;
            if (Option.isSome(oldest)) yield* forget(oldest.value.id);
            yield* update((s) => ({ ...s, link: { _tag: 'Idle' }, notice: error.reason }));
            return 'none' as const;
          });
        case 'Unreachable':
          return setLink({ _tag: 'Offline' }).pipe(Effect.as('backoff'));
        case 'NotSetUp':
          return setLink({ _tag: 'NotSetUp', reason: error.reason }).pipe(Effect.as('backoff'));
        case 'Failed':
          return setLink({ _tag: 'Failed', reason: error.reason }).pipe(Effect.as('backoff'));
      }
    };

    yield* Effect.forkScoped(
      Effect.gen(function* () {
        yield* countWaiting;
        let retry = FIRST_RETRY_MILLIS;
        for (;;) {
          const result = yield* sendOldest.pipe(Effect.result);
          if (result._tag === 'Success') {
            retry = FIRST_RETRY_MILLIS;
            if (!result.success) {
              yield* Queue.take(wake).pipe(Effect.timeoutOption(OUTBOX_POLL_MILLIS));
            }
            continue;
          }
          const pause = yield* afterFailure(result.failure);
          if (pause === 'pi') yield* Effect.sleep(PI_WAIT_MILLIS);
          if (pause === 'backoff') {
            yield* Effect.sleep(Duration.millis(retry));
            retry = Math.min(retry * 2, LAST_RETRY_MILLIS);
          }
        }
      }),
    );

    yield* button.intents.pipe(
      Stream.takeWhile((intent) => intent._tag !== 'Quit'),
      Stream.merge(Stream.fromQueue(limits), { haltStrategy: 'left' }),
      Stream.runForEach(react),
    );
    // A recording under way when the owner quits is kept, not lost.
    yield* stop;
  }),
);
