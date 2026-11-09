import type { ScreenView } from './screen.js';

/** What the buddy is doing, for the status line. */
export type Status =
  | { readonly _tag: 'Ready' }
  | { readonly _tag: 'Recording'; readonly startedAt: number };

/** Everything the screen shows, kept by the core. */
export interface BuddyState {
  readonly status: Status;
  /** The last thing worth telling the owner, such as why a recording failed. */
  readonly notice: string | undefined;
}

export const initialState: BuddyState = { status: { _tag: 'Ready' }, notice: undefined };

/** A length as `m:ss`. */
export const formatLength = (millis: number) => {
  const seconds = Math.floor(millis / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const statusLine = (status: Status, now: number) => {
  switch (status._tag) {
    case 'Ready':
      return 'Ready';
    case 'Recording':
      return `Recording ${formatLength(now - status.startedAt)}`;
  }
};

/** The screen for a state at `now`. */
export const render = (state: BuddyState, now: number): ScreenView => ({
  status: [statusLine(state.status, now), state.notice]
    .filter((part) => part !== undefined)
    .join(' · '),
});
