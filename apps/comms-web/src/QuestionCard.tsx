import {
  Alert,
  Button,
  Card,
  ChoiceList,
  List,
  ListItem,
  Stack,
  Tag,
  Text,
} from '@smotastic/pocket-design';

export type QuestionCardQuestion = {
  /** A short label of the question, such as "Stack". */
  readonly header?: string;
  readonly text: string;
  /** The chosen answer, when known. */
  readonly answer?: string;
  /** The options offered, in order, when known. */
  readonly options?: ReadonlyArray<{ readonly label: string; readonly description?: string }>;
  /** Several options may be chosen. */
  readonly multiple?: boolean;
};

/** What the owner chose so far in a question the app can answer, and how the send went. */
export type QuestionAnswering = {
  /** The chosen options' indexes, one list per question. */
  readonly chosen: ReadonlyArray<ReadonlyArray<number>>;
  readonly onChange: (question: number, chosen: ReadonlyArray<number>) => void;
  readonly onSend: () => void;
  readonly sending: boolean;
  /** The answers reached the agent; the card shows them until the session records them. */
  readonly sent: boolean;
  readonly error?: string;
};

const STATE_LABELS = { waiting: 'Waiting for your answer', unanswered: 'Not answered' } as const;

const Header = ({ question }: { readonly question: QuestionCardQuestion }) =>
  question.header === undefined ? null : <Tag>{question.header}</Tag>;

const Answer = ({ text }: { readonly text: string }) => (
  <Text>
    <Text as="span" tone="muted">
      Answer:
    </Text>{' '}
    {text}
  </Text>
);

const chosenLabels = (question: QuestionCardQuestion, chosen: ReadonlyArray<number>) =>
  chosen.map((index) => question.options?.[index]?.label ?? '').join(', ');

// The options of each question to choose from, and one send for all of them, so a mis-tap never
// leaves the agent's dialog half answered.
const Answerable = ({
  questions,
  answering,
}: {
  readonly questions: ReadonlyArray<QuestionCardQuestion>;
  readonly answering: QuestionAnswering;
}) => {
  const chosenOf = (index: number) => answering.chosen[index] ?? [];
  const complete = questions.every((_, index) => chosenOf(index).length > 0);
  return (
    <Stack gap="md">
      {questions.map((question, index) => (
        // Questions never move, and two may share a text.
        <Stack gap="xs" key={index}>
          <Header question={question} />
          <ChoiceList
            label={question.text}
            multiple={question.multiple === true}
            options={(question.options ?? []).map((option, value) => ({
              value: String(value),
              label: option.label,
              ...(option.description === undefined ? {} : { description: option.description }),
            }))}
            value={chosenOf(index).map(String)}
            onChange={(values) =>
              answering.onChange(
                index,
                values.map(Number).sort((a, b) => a - b),
              )
            }
            isDisabled={answering.sending}
          />
        </Stack>
      ))}
      {answering.error === undefined ? null : <Alert>{answering.error}</Alert>}
      <Button
        onClick={answering.onSend}
        disabled={!complete}
        pending={answering.sending}
        pendingLabel="Sending answers…"
      >
        Send answers
      </Button>
    </Stack>
  );
};

/**
 * Questions an agent asked the owner, each with its answer once given. With `answering`, the
 * owner chooses the options of a waiting call here and sends them.
 */
export const QuestionCard = ({
  questions,
  state,
  answering,
}: {
  readonly questions: ReadonlyArray<QuestionCardQuestion>;
  /** `waiting` until the owner answers; `unanswered` when they never did. */
  readonly state: 'waiting' | 'answered' | 'unanswered';
  readonly answering?: QuestionAnswering;
}) => {
  if (answering !== undefined && !answering.sent) {
    return (
      <Card>
        <Answerable questions={questions} answering={answering} />
      </Card>
    );
  }
  return (
    <Card>
      <Stack gap="sm">
        <List aria-label="Questions">
          {questions.map((question, index) => (
            // Questions never move, and two may share a text.
            <ListItem key={index}>
              <Stack gap="xs">
                <Header question={question} />
                <Text>{question.text}</Text>
                {answering !== undefined ? (
                  <Answer text={chosenLabels(question, answering.chosen[index] ?? [])} />
                ) : state !== 'answered' ? null : question.answer === undefined ? (
                  <Text tone="muted" size="sm">
                    Answered
                  </Text>
                ) : (
                  <Answer text={question.answer} />
                )}
              </Stack>
            </ListItem>
          ))}
        </List>
        {answering !== undefined ? (
          <Tag>Sent</Tag>
        ) : state === 'answered' ? null : (
          <Text tone="muted" size="sm">
            {STATE_LABELS[state]}
          </Text>
        )}
      </Stack>
    </Card>
  );
};
