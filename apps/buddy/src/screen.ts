import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

/** What the screen shows: a status line and, below it, up to three short blocks. */
export interface ScreenView {
  readonly status: string;
  readonly sent?: string;
  readonly answer?: string;
  readonly proposal?: string;
}

/** The buddy's screen; `show` replaces what it shows. */
export class Screen extends Context.Service<
  Screen,
  { readonly show: (view: ScreenView) => Effect.Effect<void> }
>()('buddy/Screen') {}
