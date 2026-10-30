import {
  Alert,
  Button,
  Card,
  Form,
  Heading,
  Inline,
  Input,
  Link,
  List,
  ListItem,
  Page,
  Stack,
  Tag,
  Text,
} from '@pocket-comms/design-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { BookmarksClient } from './bookmarks-client.js';
import { bookmarksKey, bookmarksQuery } from './bookmarks-queries.js';

const tagsOf = (text: string) =>
  text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

const hostOf = (url: string) => (URL.canParse(url) ? new URL(url).host : url);

/** Lists the active bookmarks, adds new ones, and archives or deletes them. */
export const App = ({ client }: { readonly client: BookmarksClient }) => {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  // The message of the last failed change; the next change that succeeds clears it.
  const [failure, setFailure] = useState<string | undefined>();

  const bookmarks = useQuery(bookmarksQuery(client));
  // Every change reloads the list, so the page always shows what the server stores.
  const settle = {
    onError: (cause: Error) => setFailure(cause.message),
    onSuccess: () => {
      setFailure(undefined);
      return queryClient.invalidateQueries({ queryKey: bookmarksKey });
    },
  };
  const create = useMutation({ mutationFn: client.create, ...settle });
  const archive = useMutation({ mutationFn: client.archive, ...settle });
  const remove = useMutation({ mutationFn: client.remove, ...settle });
  const error = failure ?? bookmarks.error?.message;

  const add = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      { url, title, tags: tagsOf(tags) },
      {
        onSuccess: () => {
          setUrl('');
          setTitle('');
          setTags('');
        },
      },
    );
  };

  return (
    <Page>
      <Stack gap="xl">
        <Stack as="header" gap="2xs">
          <Heading level={1}>Bookmarks</Heading>
          <Text tone="muted">Save links, tag them, archive what you are done with.</Text>
        </Stack>
        <Card>
          <Form
            aria-label="New bookmark"
            columns={2}
            onSubmit={add}
            actions={<Button type="submit">Add</Button>}
          >
            <Input
              label="URL"
              hideLabel
              span="full"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Input
              label="Title"
              hideLabel
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              label="Tags"
              hideLabel
              placeholder="Tags, comma-separated"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </Form>
        </Card>
        {error === undefined ? null : <Alert>{error}</Alert>}
        <Card padding="none">
          <List aria-label="Bookmarks" empty="No bookmarks yet.">
            {(bookmarks.data ?? []).map((bookmark) => (
              <ListItem
                key={bookmark.id}
                actions={
                  <>
                    <Button size="sm" variant="ghost" onClick={() => archive.mutate(bookmark)}>
                      Archive
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove.mutate(bookmark)}>
                      Delete
                    </Button>
                  </>
                }
              >
                <Stack gap="2xs">
                  <Link href={bookmark.url} external emphasis="strong">
                    {bookmark.title}
                  </Link>
                  <Text as="div" tone="muted" size="sm" truncate>
                    {hostOf(bookmark.url)}
                  </Text>
                  {bookmark.tags.length === 0 ? null : (
                    <Inline gap="xs">
                      {bookmark.tags.map((tag) => (
                        <Tag key={tag}>{tag}</Tag>
                      ))}
                    </Inline>
                  )}
                </Stack>
              </ListItem>
            ))}
          </List>
        </Card>
      </Stack>
    </Page>
  );
};
