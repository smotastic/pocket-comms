import { Card, Inline, Stack, Text } from '@smotastic/pocket-design';
import type { ReactNode } from 'react';

/** The text with its line breaks kept. */
const lines = (text: string) =>
  text.split('\n').flatMap((line, index) => (index === 0 ? [line] : [<br key={index} />, line]));

/** The reader's own message in a conversation: a card with a small "You" label. */
export const UserMessage = ({
  text,
  attachments,
}: {
  /** The message as written. */
  readonly text: string;
  /** Below the text, such as the thumbnails of the images the message attached. */
  readonly attachments?: ReactNode;
}) => (
  <Card>
    <Stack gap="xs">
      <Text tone="muted" size="sm">
        You
      </Text>
      {text === '' ? null : <Text>{lines(text)}</Text>}
      {attachments === undefined ? null : <Inline gap="xs">{attachments}</Inline>}
    </Stack>
  </Card>
);
