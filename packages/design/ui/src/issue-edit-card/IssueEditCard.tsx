import { useState } from 'react';
import { Alert } from '../alert/Alert.js';
import { Button } from '../button/Button.js';
import { Disclosure } from '../disclosure/Disclosure.js';
import { Input } from '../form/Input.js';
import { TextArea } from '../form/TextArea.js';
import { Tag } from '../tag/Tag.js';
import { Link } from '../text/Link.js';
import styles from './IssueEditCard.module.css';

/** An issue's title and Markdown body. */
export type IssueText = {
  readonly title: string;
  readonly body: string;
};

export type IssueEditCardProps = IssueText & {
  /** The project the issue is in, by its name. */
  readonly project: string;
  readonly number: number;
  /** The issue's page. */
  readonly url: string;
  /** The issue as the assistant read it, to compare the edit with. */
  readonly base: IssueText;
  /** `open` until the owner decides; then `updated` or `discarded`. */
  readonly state:
    | { readonly _tag: 'open' }
    | { readonly _tag: 'updated'; readonly url: string }
    | { readonly _tag: 'discarded' };
  /** Called with the title and body as the owner edited them. */
  readonly onApply: (edit: IssueText) => void;
  readonly onDiscard: () => void;
  /** The decision is on its way, or the chat takes none now: the actions are off. */
  readonly busy?: boolean;
  /** Why the last decision failed; the card stays open. */
  readonly error?: string;
};

/**
 * A new title and body an assistant proposes for an existing issue. While it is open the owner
 * edits both, compares them with the current version, and applies or discards the edit;
 * afterwards it shows the outcome.
 */
export const IssueEditCard = ({
  project,
  number,
  url,
  title,
  body,
  base,
  state,
  onApply,
  onDiscard,
  busy = false,
  error,
}: IssueEditCardProps) => {
  const [edit, setEdit] = useState<IssueText>({ title, body });
  const [comparing, setComparing] = useState(false);
  const label = `Proposed edit of issue #${number}`;

  if (state._tag !== 'open') {
    return (
      <section className={styles.card} aria-label={label}>
        <div className={styles.head}>
          <Tag>{project}</Tag>
          {state._tag === 'updated' ? (
            <Link href={state.url} external>
              Issue #{number} updated
            </Link>
          ) : (
            <span className={styles.state}>Discarded</span>
          )}
        </div>
        <p className={styles.title}>{title}</p>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-label={label}>
      <div className={styles.head}>
        <span className={styles.state}>Proposed edit</span>
        <Tag>{project}</Tag>
        <Link href={url} external>
          Issue #{number}
        </Link>
      </div>
      <div className={styles.fields}>
        <Input
          label="Title"
          value={edit.title}
          onChange={(event) => setEdit({ ...edit, title: event.target.value })}
        />
        <TextArea
          label="Body"
          rows={8}
          value={edit.body}
          onChange={(event) => setEdit({ ...edit, body: event.target.value })}
        />
      </div>
      <Disclosure
        title="Current version"
        expanded={comparing}
        onToggle={() => setComparing(!comparing)}
      >
        <p className={styles.title}>{base.title}</p>
        <p className={styles.body}>{base.body}</p>
      </Disclosure>
      {error === undefined ? null : <Alert>{error}</Alert>}
      <div className={styles.actions}>
        <Button variant="secondary" disabled={busy} onClick={onDiscard}>
          Discard
        </Button>
        <Button disabled={busy} onClick={() => onApply(edit)}>
          Apply edit
        </Button>
      </div>
    </section>
  );
};
