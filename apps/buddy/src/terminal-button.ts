import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Queue from 'effect/Queue';
import * as Stream from 'effect/Stream';
import { Button, type Intent } from './button.js';

// The laptop's keyboard as the button. A terminal never says when a key is let go, so the space
// bar toggles a recording; `y` creates a proposal, `n` discards it, Ctrl+C quits.

const CTRL_C = '\u0003';

/** The intents of typed keys. */
export const intentsOf = (keys: string) => {
  const intents: Array<Intent> = [];
  for (const key of keys) {
    if (key === ' ') intents.push({ _tag: 'Toggle' });
    else if (key.toLowerCase() === 'y') intents.push({ _tag: 'Create' });
    else if (key.toLowerCase() === 'n') intents.push({ _tag: 'Discard' });
    else if (key === CTRL_C) intents.push({ _tag: 'Quit' });
  }
  return intents;
};

/** Reads raw keys from the terminal and gives it back as it was when the program ends. */
export const layer = Layer.succeed(Button, {
  intents: Stream.callback<Intent>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const onData = (chunk: Buffer) => {
          for (const intent of intentsOf(chunk.toString('utf8'))) Queue.offerUnsafe(queue, intent);
        };
        process.stdin.setRawMode?.(true);
        process.stdin.resume();
        process.stdin.on('data', onData);
        return onData;
      }),
      (onData) =>
        Effect.sync(() => {
          process.stdin.off('data', onData);
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
        }),
    ),
  ),
});
