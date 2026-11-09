import * as Context from 'effect/Context';
import type * as Stream from 'effect/Stream';

/**
 * What the owner asks of the buddy. The button's adapter turns its gestures into these: on the
 * device a hold is `Press` then `Release`, a double press `Create`, a long press `Discard`. A
 * keyboard, which cannot tell when a key is let go, sends `Toggle`: start a recording if none is
 * under way, end it otherwise.
 */
export type Intent =
  | { readonly _tag: 'Press' }
  | { readonly _tag: 'Release' }
  | { readonly _tag: 'Toggle' }
  | { readonly _tag: 'Create' }
  | { readonly _tag: 'Discard' }
  | { readonly _tag: 'Quit' };

/** The buddy's button; the stream ends when the owner quits. */
export class Button extends Context.Service<Button, { readonly intents: Stream.Stream<Intent> }>()(
  'buddy/Button',
) {}
