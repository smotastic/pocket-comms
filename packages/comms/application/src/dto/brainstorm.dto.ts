import type { BrainstormEntry, ChatPicture, IssueDraft } from '@pocket-comms/comms-domain';
import type { ChatStreamEvent } from '@smotastic/pocket-agent/chat';

/** The brainstorm chat as the sheet shows it, or why it is not set up. */
export type BrainstormStateDto =
  | { readonly _tag: 'NotSetUp'; readonly reason: string }
  | {
      readonly _tag: 'Ready';
      /** Pi is answering; the chat takes no message or decision until it is done. */
      readonly answering: boolean;
      /** The model takes pictures; otherwise Pi only learns that pictures were attached. */
      readonly seesPictures: boolean;
      /** The pictures of the chat by number, and whether the app still keeps each. */
      readonly pictures: ReadonlyArray<ChatPicture & { readonly available: boolean }>;
      /** The server can transcribe voice messages. */
      readonly voice: boolean;
    };

/**
 * One event of the chat's stream (spec 026): a numbered entry, the package's or the chat's own,
 * text Pi just wrote, or the reply written so far.
 */
export type BrainstormEventDto = ChatStreamEvent<BrainstormEntry>;

/**
 * The owner's decision on a proposal: create the new issue as edited, apply the edit of an
 * existing issue with this title and body, or discard either; `pictures` are the chosen chat
 * pictures by id. While a created issue's pictures are not all attached, `Create` retries them
 * and `FinishWithout` leaves out the ones that are not attached (spec 023).
 */
export type ProposalDecisionInput =
  | {
      readonly _tag: 'Create';
      readonly draft: IssueDraft;
      readonly pictures?: ReadonlyArray<string> | undefined;
    }
  | {
      readonly _tag: 'Apply';
      readonly title: string;
      readonly body: string;
      readonly pictures?: ReadonlyArray<string> | undefined;
    }
  | { readonly _tag: 'Discard' }
  | { readonly _tag: 'FinishWithout' };
