import { Tag } from '../tag/Tag.js';
import hidden from '../visually-hidden.module.css';
import styles from './QuestionCard.module.css';

export type QuestionCardQuestion = {
  /** A short label of the question, such as "Stack". */
  readonly header?: string;
  readonly text: string;
  /** The chosen answer, when known. */
  readonly answer?: string;
};

export type QuestionCardProps = {
  readonly questions: ReadonlyArray<QuestionCardQuestion>;
  /** `waiting` until the owner answers; `unanswered` when they never did. */
  readonly state: 'waiting' | 'answered' | 'unanswered';
};

const STATE_LABELS = { waiting: 'Waiting for your answer', unanswered: 'Not answered' } as const;

/** Questions an agent asked the owner, each with its answer once given. Plain text that wraps. */
export const QuestionCard = ({ questions, state }: QuestionCardProps) => (
  <div className={styles.card}>
    <ol className={styles.questions} aria-label="Questions">
      {questions.map((question, index) => (
        // Questions never move, and two may share a text.
        <li key={index} className={styles.question}>
          {question.header === undefined ? null : <Tag>{question.header}</Tag>}
          <p className={styles.text}>{question.text}</p>
          {state !== 'answered' ? null : question.answer === undefined ? (
            <p className={styles.state}>Answered</p>
          ) : (
            <p className={styles.answer}>
              <span className={hidden.visuallyHidden}>Answer: </span>
              {question.answer}
            </p>
          )}
        </li>
      ))}
    </ol>
    {state === 'answered' ? null : <p className={styles.state}>{STATE_LABELS[state]}</p>}
  </div>
);
