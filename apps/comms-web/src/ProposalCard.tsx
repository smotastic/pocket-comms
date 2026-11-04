import {
  Alert,
  Button,
  Card,
  Inline,
  Input,
  Link,
  Select,
  Stack,
  Tag,
  Text,
  TextArea,
} from '@smotastic/pocket-design';
import { useState } from 'react';

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
 * An issue Pi proposes. While it is open the owner edits the project, the title and the body, and
 * creates or discards it; afterwards it shows the outcome.
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
      <section aria-label={`Proposed issue: ${title}`}>
        <Card>
          <Stack gap="xs">
            <Inline gap="sm">
              <Tag>{project}</Tag>
              {state._tag === 'created' ? (
                <Link href={state.url} external>
                  Issue #{state.number}
                </Link>
              ) : (
                <Text as="span" tone="muted" size="sm">
                  Discarded
                </Text>
              )}
            </Inline>
            <Text>{title}</Text>
          </Stack>
        </Card>
      </section>
    );
  }

  const names = [...new Set([project, ...projects])];
  return (
    <section aria-label={`Proposed issue: ${title}`}>
      <Card>
        <Stack gap="sm">
          <Text tone="muted" size="sm">
            Proposed issue
          </Text>
          <Select
            label="Project"
            value={draft.project}
            onChange={(value) => setDraft({ ...draft, project: value })}
          >
            {names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
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
          {error === undefined ? null : <Alert>{error}</Alert>}
          <Inline gap="sm" justify="end">
            <Button variant="secondary" disabled={busy} onClick={onDiscard}>
              Discard
            </Button>
            <Button disabled={busy} onClick={() => onCreate(draft)}>
              Create issue
            </Button>
          </Inline>
        </Stack>
      </Card>
    </section>
  );
};
