import type { ScreenView } from './screen.js';

/** What the buddy is doing, for the status line. */
export type Status = { readonly _tag: 'Ready' };

/** Everything the screen shows, kept by the core. */
export interface BuddyState {
  readonly status: Status;
}

export const initialState: BuddyState = { status: { _tag: 'Ready' } };

/** The screen for a state. */
export const render = (state: BuddyState): ScreenView => {
  switch (state.status._tag) {
    case 'Ready':
      return { status: 'Ready' };
  }
};
