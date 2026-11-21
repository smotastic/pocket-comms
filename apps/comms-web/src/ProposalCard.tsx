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
import { AttachedPictures, PictureChoice, type ChatPicture } from './ProposalPictures.js';

/** An issue as the proposal proposes it: the project by its name, the title and the body. */
export type ProposedIssue = {
  readonly project: string;
  readonly title: string;
  readonly body: string;
};

export type ProposalCardProps = ProposedIssue & {
  /**
   * `open` until the owner decides; then the created issue, or `discarded`. `attaching` while the
   * created issue's pictures are not all attached.
   */
  readonly state:
    | { readonly _tag: 'open' }
    | { readonly _tag: 'created'; readonly number: number; readonly url: string }
    | { readonly _tag: 'discarded' }
    | { readonly _tag: 'attaching'; readonly number: number; readonly url: string };
  /** The projects the owner may choose from, by name; the proposed one is offered too. */
  readonly projects: ReadonlyArray<string>;
  /** The pictures of the chat the owner may choose from. */
  readonly pictures?: ReadonlyArray<ChatPicture>;
  /** The chosen pictures by id: the ones Pi named while open, the owner's choice afterwards. */
  readonly chosen?: ReadonlyArray<string>;
  /** The chosen pictures that are attached to the issue in Gitea. */
  readonly attached?: ReadonlyArray<{ readonly image: string }>;
  /**
   * Called with the issue as the owner edited it and the chosen pictures; while `attaching`, it
   * retries the pictures.
   */
  readonly onCreate: (issue: ProposedIssue, pictures: ReadonlyArray<string>) => void;
  readonly onDiscard: () => void;
  /** While `attaching`: finish with the pictures attached so far. */
  readonly onFinishWithout?: () => void;
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
  pictures = [],
  chosen = [],
  attached = [],
  onCreate,
  onDiscard,
  onFinishWithout,
  busy = false,
  error,
}: ProposalCardProps) => {
  const [issue, setIssue] = useState<ProposedIssue>({ project, title, body });
  // A picture the app no longer keeps cannot go along (spec 023, requirement 10).
  const [choice, setChoice] = useState<ReadonlyArray<string>>(() =>
    chosen.filter((id) => pictures.some((picture) => picture.id === id && picture.available)),
  );

  if (state._tag === 'attaching') {
    return (
      <section aria-label={`Proposed issue: ${title}`}>
        <Card>
          <Stack gap="sm">
            <Inline gap="sm">
              <Tag>{project}</Tag>
              <Link href={state.url} external>
                Issue #{state.number} created
              </Link>
            </Inline>
            <Text>{title}</Text>
            <Text tone="muted" size="sm">
              Its pictures are not attached yet.
            </Text>
            <AttachedPictures pictures={pictures} attached={attached} />
            {error === undefined ? null : <Alert>{error}</Alert>}
            <Inline gap="sm" justify="end">
              <Button variant="secondary" disabled={busy} onClick={onFinishWithout}>
                Finish without them
              </Button>
              <Button disabled={busy} onClick={() => onCreate({ project, title, body }, chosen)}>
                Retry
              </Button>
            </Inline>
          </Stack>
        </Card>
      </section>
    );
  }

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
            <AttachedPictures pictures={pictures} attached={attached} />
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
            value={issue.project}
            onChange={(value) => setIssue({ ...issue, project: value })}
          >
            {names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <Input
            label="Title"
            value={issue.title}
            onChange={(event) => setIssue({ ...issue, title: event.target.value })}
          />
          <TextArea
            label="Body"
            rows={6}
            value={issue.body}
            onChange={(event) => setIssue({ ...issue, body: event.target.value })}
          />
          <PictureChoice pictures={pictures} chosen={choice} onChange={setChoice} disabled={busy} />
          {error === undefined ? null : <Alert>{error}</Alert>}
          <Inline gap="sm" justify="end">
            <Button variant="secondary" disabled={busy} onClick={onDiscard}>
              Discard
            </Button>
            <Button disabled={busy} onClick={() => onCreate(issue, choice)}>
              Create issue
            </Button>
          </Inline>
        </Stack>
      </Card>
    </section>
  );
};
