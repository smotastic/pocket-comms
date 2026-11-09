import type { ScreenView } from './screen.js';

/** How the buddy stands with comms, for the status line. */
export type Link =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Sending' }
  | { readonly _tag: 'PiAnswering' }
  | { readonly _tag: 'Offline' }
  | { readonly _tag: 'NotSetUp'; readonly reason: string }
  | { readonly _tag: 'Failed'; readonly reason: string };

/** At most this much of Pi's answer shows; the rest is in comms. */
export const ANSWER_LENGTH = 280;

/** A proposal still open in the chat, as the buddy shows it. */
export type OpenProposal =
  | {
      readonly kind: 'issue';
      readonly id: string;
      readonly project: string;
      readonly title: string;
      readonly body: string;
    }
  | {
      readonly kind: 'edit';
      readonly id: string;
      readonly project: string;
      readonly number: number;
    };

/** Everything the screen shows, kept by the core. */
export interface BuddyState {
  /** When the recording under way started; none while not recording. */
  readonly recordingSince: number | undefined;
  readonly link: Link;
  /** How many clips wait in the outbox. */
  readonly waiting: number;
  /** The words of the last message that reached the chat. */
  readonly sent: string | undefined;
  /** Pi's answer to it: the messages Pi finished, and the one being written. */
  readonly answer: { readonly messages: ReadonlyArray<string>; readonly streaming: string };
  /** The open proposals, the newest last. */
  readonly proposals: ReadonlyArray<OpenProposal>;
  /** The last thing worth telling the owner, such as why a recording failed. */
  readonly notice: string | undefined;
}

export const initialState: BuddyState = {
  recordingSince: undefined,
  link: { _tag: 'Idle' },
  waiting: 0,
  sent: undefined,
  answer: { messages: [], streaming: '' },
  proposals: [],
  notice: undefined,
};

const answerText = (answer: BuddyState['answer']) => {
  const whole = [...answer.messages, answer.streaming]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(' ');
  if (whole === '') return undefined;
  return whole.length <= ANSWER_LENGTH
    ? whole
    : `${whole.slice(0, ANSWER_LENGTH - 1).trimEnd()}… The rest is in comms.`;
};

const proposalView = (proposal: OpenProposal) =>
  proposal.kind === 'issue'
    ? { text: `${proposal.project}: ${proposal.title}`, decidable: true }
    : {
        text: `An edit of ${proposal.project} #${proposal.number} waits in comms`,
        decidable: false,
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
export const render = (state: BuddyState, now: number): ScreenView => {
  const answer = answerText(state.answer);
  const proposal = state.proposals.at(-1);
  return {
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
    ...(answer === undefined ? {} : { answer }),
    ...(proposal === undefined ? {} : { proposal: proposalView(proposal) }),
  };
};
