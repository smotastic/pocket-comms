import type { Story } from '@ladle/react';
import { useState } from 'react';
import { Avatar } from '../avatar/Avatar.js';
import { Button } from '../button/Button.js';
import { Composer } from '../composer/Composer.js';
import { IconButton } from '../icon-button/IconButton.js';
import { Page } from '../layout/Page.js';
import { Stack } from '../layout/Stack.js';
import { Heading } from '../text/Heading.js';
import { Text } from '../text/Text.js';
import { Sheet } from './Sheet.js';
import { SheetHeader } from './SheetHeader.js';

const Chat = ({
  initialSize,
  messages: initialMessages,
}: {
  readonly initialSize: 'tall' | 'full';
  readonly messages: number;
}) => {
  const [open, setOpen] = useState(true);
  const [size, setSize] = useState(initialSize);
  const [history, setHistory] = useState(false);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<ReadonlyArray<string>>(
    Array.from({ length: initialMessages }, (_, index) => `Message ${index + 1}.`),
  );
  const close = () => setOpen(false);
  const send = (message: string) => {
    setMessages([...messages, message]);
    setText('');
  };
  return (
    <>
      <Page>
        <Stack gap="md">
          <Heading level={1}>Overview</Heading>
          <Button onClick={() => setOpen(true)}>Open the chat</Button>
          {Array.from({ length: 30 }, (_, index) => (
            <Text key={index}>{`Line ${index + 1}: the screen behind the sheet.`}</Text>
          ))}
        </Stack>
      </Page>
      <Sheet
        open={open}
        size={size}
        label="Assistant"
        bodyLabel={history ? 'History' : 'Conversation'}
        onClose={close}
        follow={!history}
        header={
          <SheetHeader
            avatar={<Avatar initials="A" />}
            title="Assistant"
            subtitle={messages.length === 0 ? 'New chat' : 'Chat · How do I rename a branch?'}
          >
            <IconButton
              icon="history"
              label="History"
              pressed={history}
              onClick={() => setHistory(!history)}
            />
            <IconButton icon="plus" label="New chat" onClick={() => setMessages([])} />
            <IconButton
              icon="expand"
              label="Expand"
              onClick={() => setSize(size === 'tall' ? 'full' : 'tall')}
            />
            <IconButton icon="close" label="Close" onClick={close} />
          </SheetHeader>
        }
        footer={
          history ? undefined : (
            <Composer
              label="Message"
              placeholder="Write a message…"
              value={text}
              onChange={setText}
              onSend={send}
            />
          )
        }
      >
        {history ? (
          <Stack gap="md">
            {Array.from({ length: 8 }, (_, index) => (
              <Text key={index}>{`Chat ${index + 1}`}</Text>
            ))}
          </Stack>
        ) : messages.length === 0 ? (
          <Text>Hi! How can I help?</Text>
        ) : (
          <Stack gap="md">
            {messages.map((message, index) => (
              <Text key={index}>{message}</Text>
            ))}
          </Stack>
        )}
      </Sheet>
    </>
  );
};

export const Tall: Story = () => <Chat initialSize="tall" messages={20} />;

export const EmptyChat: Story = () => <Chat initialSize="tall" messages={0} />;

export const Full: Story = () => <Chat initialSize="full" messages={20} />;
