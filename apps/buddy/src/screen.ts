import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

/**
 * What the screen shows: a status line, what was sent, the start of Pi's answer, and a proposal.
 * A `decidable` proposal can be created or discarded from the buddy; the screen names the
 * gestures that do it.
 */
export interface ScreenView {
  readonly status: string;
  readonly sent?: string;
  readonly answer?: string;
  readonly proposal?: { readonly text: string; readonly decidable: boolean };
}

/** The buddy's screen; `show` replaces what it shows. */
export class Screen extends Context.Service<
  Screen,
  { readonly show: (view: ScreenView) => Effect.Effect<void> }
>()('buddy/Screen') {}
