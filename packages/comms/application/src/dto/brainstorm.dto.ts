import type { Lane } from '@pocket-comms/comms-domain';
import type { BrainstormEntry, BrainstormImage, ProposedIssue } from '@pocket-comms/comms-domain';
import type { ChatStreamEvent } from '@smotastic/pocket-agent/chat';

/** The brainstorm as the sheet shows it, or why it is not set up. */
export type BrainstormStateDto =
  | { readonly _tag: 'NotSetUp'; readonly reason: string }
  | {
      readonly _tag: 'Ready';
      /** Pi is answering; the brainstorm takes no message or decision until it is done. */
      readonly answering: boolean;
      /** The model takes images; otherwise Pi only learns that images were attached. */
      readonly seesImages: boolean;
      /** The images of the brainstorm by number, and whether the app still keeps each. */
      readonly images: ReadonlyArray<BrainstormImage & { readonly available: boolean }>;
      /** The server can transcribe voice messages. */
      readonly voice: boolean;
    };

/**
 * One event of the brainstorm's stream (spec 026): a numbered entry, the package's or the brainstorm's own,
 * text Pi just wrote, or the reply written so far.
 */
export type BrainstormEventDto = ChatStreamEvent<BrainstormEntry>;

/**
 * The owner's decision on a proposal: create the new issue as edited, apply the edit of an
 * existing issue with this title and body, or discard either; `images` are the chosen brainstorm
 * images by id. While a created issue's images are not all attached, `Create` retries them
 * and `FinishWithout` leaves out the ones that are not attached (spec 023).
 */
export type ProposalDecisionInput =
  | {
      readonly _tag: 'Create';
      readonly issue: ProposedIssue;
      readonly images?: ReadonlyArray<string> | undefined;
      /** Sends the created issue on a mission in this lane (spec 035). */
      readonly lane?: Lane | undefined;
    }
  | {
      readonly _tag: 'Apply';
      readonly title: string;
      readonly body: string;
      readonly images?: ReadonlyArray<string> | undefined;
      /** Sends the updated issue on a mission in this lane (spec 035). */
      readonly lane?: Lane | undefined;
    }
  | { readonly _tag: 'Discard' }
  | { readonly _tag: 'FinishWithout' };
