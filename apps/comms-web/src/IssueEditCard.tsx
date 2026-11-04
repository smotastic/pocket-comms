import {
  Alert,
  Button,
  Card,
  Disclosure,
  Inline,
  Input,
  Link,
  Stack,
  Tag,
  Text,
  TextArea,
} from '@smotastic/pocket-design';
import { useState } from 'react';
import { AttachedPictures, PictureChoice, type ChatPicture } from './ProposalPictures.js';

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
  /** The pictures of the chat the owner may choose from. */
  readonly pictures?: ReadonlyArray<ChatPicture>;
  /** The chosen pictures by id: the ones Pi named while open, the owner's choice afterwards. */
  readonly chosen?: ReadonlyArray<string>;
  /** The chosen pictures that are attached to the issue in Gitea. */
  readonly attached?: ReadonlyArray<{ readonly image: string }>;
  /** Called with the title and body as the owner edited them, and the chosen pictures. */
  readonly onApply: (edit: IssueText, pictures: ReadonlyArray<string>) => void;
  readonly onDiscard: () => void;
  /** The decision is on its way, or the chat takes none now: the actions are off. */
  readonly busy?: boolean;
  /** Why the last decision failed; the card stays open. */
  readonly error?: string;
};

/** The text with its line breaks kept. */
const lines = (text: string) =>
  text.split('\n').flatMap((line, index) => (index === 0 ? [line] : [<br key={index} />, line]));

/**
 * A new title and body Pi proposes for an existing issue. While it is open the owner edits both,
 * compares them with the current version, and applies or discards the edit; afterwards it shows
 * the outcome.
 */
export const IssueEditCard = ({
  project,
  number,
  url,
  title,
  body,
  base,
  state,
  pictures = [],
  chosen = [],
  attached = [],
  onApply,
  onDiscard,
  busy = false,
  error,
}: IssueEditCardProps) => {
  const [edit, setEdit] = useState<IssueText>({ title, body });
  // A picture the app no longer keeps cannot go along (spec 023, requirement 10).
  const [choice, setChoice] = useState<ReadonlyArray<string>>(() =>
    chosen.filter((id) => pictures.some((picture) => picture.id === id && picture.available)),
  );
  const [comparing, setComparing] = useState(false);
  const label = `Proposed edit of issue #${number}`;

  if (state._tag !== 'open') {
    return (
      <section aria-label={label}>
        <Card>
          <Stack gap="xs">
            <Inline gap="sm">
              <Tag>{project}</Tag>
              {state._tag === 'updated' ? (
                <Link href={state.url} external>
                  Issue #{number} updated
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

  return (
    <section aria-label={label}>
      <Card>
        <Stack gap="sm">
          <Inline gap="sm">
            <Text as="span" tone="muted" size="sm">
              Proposed edit
            </Text>
            <Tag>{project}</Tag>
            <Link href={url} external>
              Issue #{number}
            </Link>
          </Inline>
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
          <Disclosure title="Current version" expanded={comparing} onExpandedChange={setComparing}>
            {/* Mounted only while open, so the old text is out of the page while it is closed. */}
            {comparing ? (
              <Stack gap="xs">
                <Text>{base.title}</Text>
                <Text tone="muted" size="sm">
                  {lines(base.body)}
                </Text>
              </Stack>
            ) : null}
          </Disclosure>
          <PictureChoice pictures={pictures} chosen={choice} onChange={setChoice} disabled={busy} />
          {error === undefined ? null : <Alert>{error}</Alert>}
          <Inline gap="sm" justify="end">
            <Button variant="secondary" disabled={busy} onClick={onDiscard}>
              Discard
            </Button>
            <Button disabled={busy} onClick={() => onApply(edit, choice)}>
              Apply edit
            </Button>
          </Inline>
        </Stack>
      </Card>
    </section>
  );
};
