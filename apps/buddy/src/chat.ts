import type { BrainstormEventView } from './comms.js';
import type { BuddyState, OpenProposal } from './view.js';

// How one event of the brainstorm chat changes what the buddy shows.

type Proposal = Extract<
  Extract<BrainstormEventView, { readonly kind: 'entry' }>['entry'],
  { readonly kind: 'proposal' }
>['proposal'];

const toOpen = (proposal: Proposal): OpenProposal =>
  proposal.kind === 'issue'
    ? {
        kind: 'issue',
        id: proposal.id,
        project: proposal.project,
        title: proposal.title,
        body: proposal.body,
      }
    : { kind: 'edit', id: proposal.id, project: proposal.project, number: proposal.number };

/** What the owner hears about a proposal the buddy decided, once comms has done it. */
const outcome = (proposal: Proposal) =>
  proposal.kind === 'issue' &&
  (proposal.state._tag === 'created' || proposal.state._tag === 'attaching')
    ? `Issue #${proposal.state.number} created.`
    : undefined;

/**
 * The state after `event`. `decidedHere` names the proposals the buddy decided itself; only
 * their outcome is told, so a chat replayed on start says nothing about old ones.
 */
export const applyEvent = (
  state: BuddyState,
  event: BrainstormEventView,
  decidedHere: ReadonlySet<string>,
): BuddyState => {
  switch (event.kind) {
    case 'delta':
      return {
        ...state,
        answer: { ...state.answer, streaming: state.answer.streaming + event.text },
      };
    case 'draft':
      return { ...state, answer: { ...state.answer, streaming: event.text } };
    case 'entry':
      break;
  }
  const entry = event.entry;
  switch (entry.kind) {
    case 'said':
      return { ...state, sent: entry.text, answer: { messages: [], streaming: '' } };
    case 'agentMessage':
      return {
        ...state,
        answer: { messages: [...state.answer.messages, entry.text], streaming: '' },
      };
    case 'turnEnded':
    case 'turnFailed':
    case 'turnStopped':
      return { ...state, answer: { ...state.answer, streaming: '' } };
    case 'chatStarted':
      return { ...state, sent: undefined, answer: { messages: [], streaming: '' }, proposals: [] };
    case 'proposal': {
      const proposal = entry.proposal;
      const others = state.proposals.filter((open) => open.id !== proposal.id);
      if (proposal.state._tag === 'open') {
        return { ...state, proposals: [...others, toOpen(proposal)] };
      }
      const told = decidedHere.has(proposal.id) ? outcome(proposal) : undefined;
      return { ...state, proposals: others, ...(told === undefined ? {} : { notice: told }) };
    }
    case 'toolStarted':
    case 'toolFinished':
      return state;
  }
};
