import type { ScreenView } from './screen.js';

/** How the buddy stands with comms, for the status line. */
export type Link =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Sending' }
  | { readonly _tag: 'PiAnswering' }
  | { readonly _tag: 'Offline' }
  | { readonly _tag: 'NotSetUp'; readonly reason: string }
  | { readonly _tag: 'Failed'; readonly reason: string };

/** Everything the screen shows, kept by the core. */
export interface BuddyState {
  /** When the recording under way started; none while not recording. */
  readonly recordingSince: number | undefined;
  readonly link: Link;
  /** How many clips wait in the outbox. */
  readonly waiting: number;
  /** The words of the last message that reached the chat. */
  readonly sent: string | undefined;
  /** The last thing worth telling the owner, such as why a recording failed. */
  readonly notice: string | undefined;
}

export const initialState: BuddyState = {
  recordingSince: undefined,
  link: { _tag: 'Idle' },
  waiting: 0,
  sent: undefined,
  notice: undefined,
};

/** A length as `m:ss`. */
export const formatLength = (millis: number) => {
  const seconds = Math.floor(millis / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const linkLine = (link: Link) => {
  switch (link._tag) {
    case 'Idle':
      return 'Ready';
    case 'Sending':
      return 'Sending';
    case 'PiAnswering':
      return 'Pi is answering';
    case 'Offline':
      return 'Offline';
    case 'NotSetUp':
      return `Not set up: ${link.reason}`;
    case 'Failed':
      return `Failed: ${link.reason}`;
  }
};

/** The screen for a state at `now`. */
export const render = (state: BuddyState, now: number): ScreenView => ({
  status: [
    state.recordingSince === undefined
      ? linkLine(state.link)
      : `Recording ${formatLength(now - state.recordingSince)}`,
    state.waiting > 0 ? `${state.waiting} waiting` : undefined,
    state.notice,
  ]
    .filter((part) => part !== undefined)
    .join(' · '),
  ...(state.sent === undefined ? {} : { sent: state.sent }),
});
