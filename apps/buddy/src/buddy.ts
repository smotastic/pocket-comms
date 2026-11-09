import * as Effect from 'effect/Effect';
import * as Queue from 'effect/Queue';
import * as Ref from 'effect/Ref';
import * as Stream from 'effect/Stream';
import { Button } from './button.js';
import { Screen } from './screen.js';
import { initialState, render, type BuddyState } from './view.js';

// The buddy's program over its ports: it records what the owner says, sends it to the brainstorm
// chat, follows Pi's answer and keeps the screen current. It ends when the owner quits.

export const buddy = Effect.scoped(
  Effect.gen(function* () {
    const button = yield* Button;
    const screen = yield* Screen;
    const state = yield* Ref.make<BuddyState>(initialState);
    // One fiber draws the screen, so views never overtake each other; a change only marks it.
    const dirty = yield* Queue.sliding<void>(1);
    const redraw = Queue.offer(dirty, undefined);

    yield* Effect.forkScoped(
      Effect.forever(
        Queue.take(dirty).pipe(
          Effect.andThen(Ref.get(state)),
          Effect.flatMap((current) => screen.show(render(current))),
        ),
      ),
    );
    yield* redraw;

    yield* button.intents.pipe(
      Stream.takeWhile((intent) => intent._tag !== 'Quit'),
      Stream.runDrain,
    );
  }),
);
