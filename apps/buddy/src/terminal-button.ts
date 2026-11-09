import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Queue from 'effect/Queue';
import * as Stream from 'effect/Stream';
import { Button, type Intent } from './button.js';

// The laptop's keyboard as the button. A terminal never says when a key is let go, so the space
// bar starts a recording and the next space ends it; `y` creates a proposal, `n` discards it.

const CTRL_C = '\u0003';

/** The intents of typed keys, and whether the space bar now holds a recording. */
export const intentsOf = (keys: string, held: boolean) => {
  const intents: Array<Intent> = [];
  let holding = held;
  for (const key of keys) {
    if (key === ' ') {
      intents.push({ _tag: holding ? 'Release' : 'Press' });
      holding = !holding;
    } else if (key.toLowerCase() === 'y') intents.push({ _tag: 'Create' });
    else if (key.toLowerCase() === 'n') intents.push({ _tag: 'Discard' });
    else if (key === CTRL_C) intents.push({ _tag: 'Quit' });
  }
  return { intents, held: holding };
};

/** Reads raw keys from the terminal and gives it back as it was when the program ends. */
export const layer = Layer.succeed(Button, {
  intents: Stream.callback<Intent>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        let held = false;
        const onData = (chunk: Buffer) => {
          const read = intentsOf(chunk.toString('utf8'), held);
          held = read.held;
          for (const intent of read.intents) Queue.offerUnsafe(queue, intent);
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
