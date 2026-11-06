import {
  Alert,
  AppBar,
  Button,
  Form,
  IconButton,
  Input,
  List,
  ListItem,
  Page,
  SectionHeader,
  Stack,
  Text,
} from '@smotastic/pocket-design';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { BrainstormAction } from './Brainstorm.js';
import { RequestError, type CommsClient } from './comms-client.js';
import { quickRepliesKey, quickRepliesQuery } from './comms-queries.js';

export interface SettingsPageProps {
  readonly client: CommsClient;
  readonly onBack: () => void;
}

// The server's limits; it answers why a list breaks one.
const MAX_REPLIES = 20;
const MAX_LENGTH = 200;

/** What a failed save says: the rules the list broke, or why it was not kept. */
const reasonOf = (error: Error) =>
  error instanceof RequestError && error.issues.length > 0
    ? error.issues.map((issue) => issue.message).join(' ')
    : error.message;

const submitted = (save: () => void) => (event: FormEvent) => {
  event.preventDefault();
  save();
};

/** A field that edits one reply, from its saved text each time it opens. */
const EditReply = ({
  reply,
  busy,
  onSave,
  onCancel,
}: {
  readonly reply: string;
  readonly busy: boolean;
  readonly onSave: (text: string) => void;
  readonly onCancel: () => void;
}) => {
  const [text, setText] = useState(reply);
  return (
    <ListItem>
      <Form
        aria-label={`Edit ${reply}`}
        onSubmit={submitted(() => onSave(text))}
        actions={
          <>
            <Button type="submit" size="sm" pending={busy} pendingLabel="Saving">
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </>
        }
      >
        <Input
          label="Edit the reply"
          hideLabel
          value={text}
          maxLength={MAX_LENGTH}
          onChange={(event) => setText(event.target.value)}
        />
      </Form>
    </ListItem>
  );
};

/** One reply with its actions, or a field to edit it. */
const ReplyItem = ({
  reply,
  first,
  last,
  editing,
  busy,
  onMove,
  onEdit,
  onSave,
  onCancel,
  onDelete,
}: {
  readonly reply: string;
  readonly first: boolean;
  readonly last: boolean;
  readonly editing: boolean;
  readonly busy: boolean;
  readonly onMove: (by: -1 | 1) => void;
  readonly onEdit: () => void;
  readonly onSave: (text: string) => void;
  readonly onCancel: () => void;
  readonly onDelete: () => void;
}) => {
  if (editing) return <EditReply reply={reply} busy={busy} onSave={onSave} onCancel={onCancel} />;
  return (
    <ListItem
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Move ${reply} up`}
            disabled={first || busy}
            onClick={() => onMove(-1)}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Move ${reply} down`}
            disabled={last || busy}
            onClick={() => onMove(1)}
          >
            ↓
          </Button>
          <IconButton icon="edit" label={`Edit ${reply}`} disabled={busy} onClick={onEdit} />
          <IconButton icon="delete" label={`Delete ${reply}`} disabled={busy} onClick={onDelete} />
        </>
      }
    >
      <Text>{reply}</Text>
    </ListItem>
  );
};

/**
 * `/settings`: the owner's quick replies, offered with one tap in every conversation.
 * Each change saves the whole list at once; a failed save says why and shows the saved list.
 */
export const SettingsPage = ({ client, onBack }: SettingsPageProps) => {
  const queryClient = useQueryClient();
  const saved = useQuery(quickRepliesQuery(client));
  const [added, setAdded] = useState('');
  const [editing, setEditing] = useState<string>();
  const save = useMutation({
    mutationFn: ({
      replies,
    }: {
      readonly replies: ReadonlyArray<string>;
      readonly adds: boolean;
    }) => client.saveQuickReplies(replies),
    onSuccess: (replies, { adds }) => {
      queryClient.setQueryData(quickRepliesKey, replies);
      setEditing(undefined);
      if (adds) setAdded('');
    },
  });
  const replies = saved.data;
  const replace = (next: ReadonlyArray<string>, adds = false) =>
    save.mutate({ replies: next, adds });

  const move = (index: number, by: -1 | 1) => {
    if (replies === undefined) return;
    const next = [...replies];
    const [reply] = next.splice(index, 1);
    if (reply === undefined) return;
    next.splice(index + by, 0, reply);
    replace(next);
  };

  return (
    <>
      <AppBar
        start={<IconButton icon="back" label="Back to all agents" onClick={onBack} />}
        title="Settings"
        end={<BrainstormAction />}
      />
      <Page>
        <Stack gap="lg">
          <Stack gap="sm">
            <SectionHeader
              title="Quick replies"
              {...(replies === undefined ? {} : { count: replies.length })}
            />
            <Text tone="muted" size="sm">
              Offered with one tap in every conversation, in this order.
            </Text>
            {save.error === null ? null : <Alert>{reasonOf(save.error)}</Alert>}
            {saved.error === null ? null : <Alert>{saved.error.message}</Alert>}
            {replies === undefined ? (
              saved.isPending ? (
                <Text tone="muted">Loading the quick replies…</Text>
              ) : null
            ) : (
              <>
                <List
                  aria-label="Quick replies"
                  empty={<Text tone="muted">No quick replies yet.</Text>}
                >
                  {replies.map((reply, index) => (
                    <ReplyItem
                      key={reply}
                      reply={reply}
                      first={index === 0}
                      last={index === replies.length - 1}
                      editing={editing === reply}
                      busy={save.isPending}
                      onMove={(by) => move(index, by)}
                      onEdit={() => {
                        save.reset();
                        setEditing(reply);
                      }}
                      onSave={(text) =>
                        replace(replies.map((kept, at) => (at === index ? text : kept)))
                      }
                      onCancel={() => setEditing(undefined)}
                      onDelete={() => replace(replies.filter((_, at) => at !== index))}
                    />
                  ))}
                </List>
                <Form
                  aria-label="Add a quick reply"
                  onSubmit={submitted(() => {
                    if (added.trim() !== '') replace([...replies, added], true);
                  })}
                  actions={
                    <Button
                      type="submit"
                      icon="plus"
                      disabled={replies.length >= MAX_REPLIES}
                      pending={save.isPending}
                      pendingLabel="Saving"
                    >
                      Add
                    </Button>
                  }
                >
                  <Input
                    label="New quick reply"
                    value={added}
                    maxLength={MAX_LENGTH}
                    placeholder="Run the tests first"
                    onChange={(event) => setAdded(event.target.value)}
                  />
                </Form>
                {replies.length >= MAX_REPLIES ? (
                  <Text tone="muted" size="sm">
                    {`At most ${MAX_REPLIES} quick replies; delete one to add another.`}
                  </Text>
                ) : null}
              </>
            )}
          </Stack>
        </Stack>
      </Page>
    </>
  );
};
