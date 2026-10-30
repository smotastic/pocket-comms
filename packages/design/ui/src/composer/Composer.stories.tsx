import type { Story } from '@ladle/react';
import { useState } from 'react';
import { IconButton } from '../icon-button/IconButton.js';
import { Inline } from '../layout/Inline.js';
import { Stack } from '../layout/Stack.js';
import { Tag } from '../tag/Tag.js';
import { Text } from '../text/Text.js';
import { Composer } from './Composer.js';

const HINT = 'Files change only when you approve it.';

export const WithContext: Story = () => {
  const [text, setText] = useState('');
  const [file, setFile] = useState(true);
  const [sent, setSent] = useState<ReadonlyArray<string>>([]);
  return (
    <Stack gap="md">
      {sent.map((message, index) => (
        <Text key={index}>{message}</Text>
      ))}
      <Composer
        label="Message"
        placeholder="Write a message…"
        value={text}
        onChange={setText}
        onSend={(message) => {
          setSent([...sent, file ? `About notes.md: ${message}` : message]);
          setText('');
        }}
        context={
          file ? (
            <Inline gap="xs">
              <Tag>notes.md</Tag>
              <IconButton icon="close" label="Remove notes.md" onClick={() => setFile(false)} />
            </Inline>
          ) : undefined
        }
        hint={HINT}
      />
    </Stack>
  );
};

export const Locked: Story = () => {
  const [text, setText] = useState('I can write ahead');
  return (
    <Composer
      label="Message"
      value={text}
      onChange={setText}
      onSend={() => undefined}
      locked
      hint="A reply is coming in…"
    />
  );
};

export const Disabled: Story = () => (
  <Composer
    label="Message"
    placeholder="The chat cannot be reached."
    value=""
    onChange={() => undefined}
    onSend={() => undefined}
    disabled
  />
);
