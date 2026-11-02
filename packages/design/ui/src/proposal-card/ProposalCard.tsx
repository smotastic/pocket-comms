import { useState } from 'react';
import { Alert } from '../alert/Alert.js';
import { Button } from '../button/Button.js';
import { Input } from '../form/Input.js';
import { Select } from '../form/Select.js';
import { TextArea } from '../form/TextArea.js';
import { Tag } from '../tag/Tag.js';
import { Link } from '../text/Link.js';
import styles from './ProposalCard.module.css';

/** An issue as the proposal drafts it: the project by its name, the title and the body. */
export type ProposalDraft = {
  readonly project: string;
  readonly title: string;
  readonly body: string;
};

export type ProposalCardProps = ProposalDraft & {
  /** `open` until the owner decides; then the created issue, or `discarded`. */
  readonly state:
    | { readonly _tag: 'open' }
    | { readonly _tag: 'created'; readonly number: number; readonly url: string }
    | { readonly _tag: 'discarded' };
  /** The projects the owner may choose from, by name; the drafted one is offered too. */
  readonly projects: ReadonlyArray<string>;
  /** Called with the draft as the owner edited it. */
  readonly onCreate: (draft: ProposalDraft) => void;
  readonly onDiscard: () => void;
  /** The decision is on its way, or the chat takes none now: the actions are off. */
  readonly busy?: boolean;
  /** Why the last decision failed; the card stays open. */
  readonly error?: string;
};

/**
 * An issue an assistant proposes. While it is open the owner edits the project, the title and the
 * body, and creates or discards it; afterwards it shows the outcome.
 */
export const ProposalCard = ({
  project,
  title,
  body,
  state,
  projects,
  onCreate,
  onDiscard,
  busy = false,
  error,
}: ProposalCardProps) => {
  const [draft, setDraft] = useState<ProposalDraft>({ project, title, body });

  if (state._tag !== 'open') {
    return (
      <section className={styles.card} aria-label={`Proposed issue: ${title}`}>
        <div className={styles.head}>
          <Tag>{project}</Tag>
          {state._tag === 'created' ? (
            <Link href={state.url} external>
              Issue #{state.number}
            </Link>
          ) : (
            <span className={styles.state}>Discarded</span>
          )}
        </div>
        <p className={styles.title}>{title}</p>
      </section>
    );
  }

  const options = [...new Set([project, ...projects])].map((name) => ({
    value: name,
    label: name,
  }));
  return (
    <section className={styles.card} aria-label={`Proposed issue: ${title}`}>
      <p className={styles.state}>Proposed issue</p>
      <div className={styles.fields}>
        <Select
          label="Project"
          value={draft.project}
          options={options}
          onChange={(event) => setDraft({ ...draft, project: event.target.value })}
        />
        <Input
          label="Title"
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
        <TextArea
          label="Body"
          rows={6}
          value={draft.body}
          onChange={(event) => setDraft({ ...draft, body: event.target.value })}
        />
      </div>
      {error === undefined ? null : <Alert>{error}</Alert>}
      <div className={styles.actions}>
        <Button variant="secondary" disabled={busy} onClick={onDiscard}>
          Discard
        </Button>
        <Button disabled={busy} onClick={() => onCreate(draft)}>
          Create issue
        </Button>
      </div>
    </section>
  );
};
