import type { BrainstormEntry, IssueDraft } from '@pocket-comms/comms-domain';

/** The brainstorm chat as the sheet shows it, or why it is not set up. */
export type BrainstormStateDto =
  | { readonly _tag: 'NotSetUp'; readonly reason: string }
  | {
      readonly _tag: 'Ready';
      readonly entries: ReadonlyArray<BrainstormEntry>;
      /** Pi is answering; the chat takes no message or decision until it is done. */
      readonly answering: boolean;
      /** The text of Pi's message so far, while it writes one. */
      readonly live: string;
    };

/** A live update: the whole state after each change, or text Pi just wrote. */
export type BrainstormEventDto =
  | { readonly type: 'state'; readonly state: BrainstormStateDto }
  | { readonly type: 'delta'; readonly text: string };

/**
 * The owner's decision on a proposal: create the new issue as edited, apply the edit of an
 * existing issue with this title and body, or discard either.
 */
export type ProposalDecisionInput =
  | { readonly _tag: 'Create'; readonly draft: IssueDraft }
  | { readonly _tag: 'Apply'; readonly title: string; readonly body: string }
  | { readonly _tag: 'Discard' };
