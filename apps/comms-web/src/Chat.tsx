import { ImageThumb, Markdown, Text } from '@smotastic/pocket-design';
import { MISSING } from './AttachedImages.js';
import type { TranscriptView } from './comms-client.js';
import { QuestionCard } from './QuestionCard.js';
import { ToolLine } from './ToolLine.js';
import { UserMessage } from './UserMessage.js';

export type ToolEntry = Extract<TranscriptView['entries'][number], { readonly type: 'tool' }>;

/** Where a tool line leads, when it leads somewhere, and a note on what it started. */
export interface ToolLink {
  readonly href?: string;
  readonly onNavigate?: () => void;
  readonly hint?: string;
}

// A call that asked the owner questions waits while pending and failed when they never answered.
const QUESTION_STATES = { pending: 'waiting', ok: 'answered', error: 'unanswered' } as const;

/**
 * A conversation's entries as a chat. `linkOf` makes a tool call a link, such as a delegation to
 * the subagent it started.
 */
export const Chat = ({
  transcript,
  failed,
  imageUrl,
  linkOf = () => undefined,
}: {
  readonly transcript: TranscriptView | undefined;
  /** Where an attached image of a prompt is served (spec 014). */
  readonly imageUrl: (id: string) => string;
  /** The session cannot be read, such as before the agent's first prompt. */
  readonly failed: boolean;
  readonly linkOf?: (entry: ToolEntry) => ToolLink | undefined;
}) => {
  if (transcript === undefined) {
    return (
      <Text tone="muted">{failed ? 'No conversation yet.' : 'Loading the conversation…'}</Text>
    );
  }
  if (transcript.entries.length === 0) return <Text tone="muted">Nothing was said yet.</Text>;
  return (
    <>
      {transcript.entries.map((entry) => {
        switch (entry.type) {
          case 'user':
            return (
              <UserMessage
                key={entry.id}
                text={entry.text}
                {...(entry.images === undefined || entry.images.length === 0
                  ? {}
                  : {
                      attachments: entry.images.map((id, index) => (
                        <ImageThumb
                          key={id}
                          label={`Image ${index + 1}`}
                          src={imageUrl(id)}
                          href={imageUrl(id)}
                          missingText={MISSING}
                        />
                      )),
                    })}
              />
            );
          case 'assistant':
            return <Markdown key={entry.id} text={entry.text} />;
          case 'tool':
            if (entry.questions !== undefined) {
              return (
                <QuestionCard
                  key={entry.id}
                  questions={entry.questions.map(({ header, text, answer }) => ({
                    text,
                    ...(header === undefined ? {} : { header }),
                    ...(answer === undefined ? {} : { answer }),
                  }))}
                  state={QUESTION_STATES[entry.outcome]}
                />
              );
            }
            return (
              <ToolLine
                key={entry.id}
                verb={entry.verb}
                {...(entry.target === undefined ? {} : { target: entry.target })}
                {...(entry.added === undefined ? {} : { added: entry.added })}
                {...(entry.removed === undefined ? {} : { removed: entry.removed })}
                outcome={entry.outcome}
                {...linkOf(entry)}
              />
            );
        }
      })}
    </>
  );
};
