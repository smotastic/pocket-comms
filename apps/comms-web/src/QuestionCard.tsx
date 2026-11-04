import { Card, List, ListItem, Stack, Tag, Text } from '@smotastic/pocket-design';

export type QuestionCardQuestion = {
  /** A short label of the question, such as "Stack". */
  readonly header?: string;
  readonly text: string;
  /** The chosen answer, when known. */
  readonly answer?: string;
};

const STATE_LABELS = { waiting: 'Waiting for your answer', unanswered: 'Not answered' } as const;

/** Questions an agent asked the owner, each with its answer once given. */
export const QuestionCard = ({
  questions,
  state,
}: {
  readonly questions: ReadonlyArray<QuestionCardQuestion>;
  /** `waiting` until the owner answers; `unanswered` when they never did. */
  readonly state: 'waiting' | 'answered' | 'unanswered';
}) => (
  <Card>
    <Stack gap="sm">
      <List aria-label="Questions">
        {questions.map((question, index) => (
          // Questions never move, and two may share a text.
          <ListItem key={index}>
            <Stack gap="xs">
              {question.header === undefined ? null : <Tag>{question.header}</Tag>}
              <Text>{question.text}</Text>
              {state !== 'answered' ? null : question.answer === undefined ? (
                <Text tone="muted" size="sm">
                  Answered
                </Text>
              ) : (
                <Text>
                  <Text as="span" tone="muted">
                    Answer:
                  </Text>{' '}
                  {question.answer}
                </Text>
              )}
            </Stack>
          </ListItem>
        ))}
      </List>
      {state === 'answered' ? null : (
        <Text tone="muted" size="sm">
          {STATE_LABELS[state]}
        </Text>
      )}
    </Stack>
  </Card>
);
