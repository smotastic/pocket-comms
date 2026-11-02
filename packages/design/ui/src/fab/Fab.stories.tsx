import type { Story } from '@ladle/react';
import { useState } from 'react';
import { Composer } from '../composer/Composer.js';
import { DockedPage } from '../layout/DockedPage.js';
import { Page } from '../layout/Page.js';
import { Stack } from '../layout/Stack.js';
import { Heading } from '../text/Heading.js';
import { Text } from '../text/Text.js';
import { Fab } from './Fab.js';

const lines = (count: number) =>
  Array.from({ length: count }, (_, index) => (
    <Text key={index}>{`Line ${index + 1}: the button floats at the bottom right.`}</Text>
  ));

export const OnAPage: Story = () => {
  const [answering, setAnswering] = useState(true);
  return (
    <>
      <Page>
        <Stack gap="md">
          <Heading level={1}>Agents</Heading>
          {lines(30)}
        </Stack>
      </Page>
      <Fab
        icon="brainstorm"
        label="Brainstorm"
        badge={answering ? 'Pi is answering' : undefined}
        onClick={() => setAnswering(!answering)}
      />
    </>
  );
};

export const AboveADockedFooter: Story = () => {
  const [text, setText] = useState('');
  return (
    <>
      <DockedPage
        header={<Heading level={1}>Conversation</Heading>}
        footer={
          <Composer label="Message" value={text} onChange={setText} onSend={() => setText('')} />
        }
        label="Conversation"
      >
        <Stack gap="md">{lines(30)}</Stack>
      </DockedPage>
      <Fab icon="brainstorm" label="Brainstorm" />
    </>
  );
};
