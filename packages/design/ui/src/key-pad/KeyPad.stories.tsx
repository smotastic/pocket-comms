import type { Story } from '@ladle/react';
import { useState } from 'react';
import { Stack } from '../layout/Stack.js';
import { Text } from '../text/Text.js';
import { KeyPad } from './KeyPad.js';

export const AnswerKeys: Story = () => {
  const [sent, setSent] = useState('nothing yet');
  return (
    <Stack gap="sm">
      <KeyPad
        label="Keys"
        keys={[
          { value: '1', label: '1' },
          { value: '2', label: '2' },
          { value: '3', label: '3' },
          { value: 'up', label: '↑', accessibleLabel: 'Up' },
          { value: 'down', label: '↓', accessibleLabel: 'Down' },
          { value: 'enter', label: 'Enter' },
          { value: 'esc', label: 'Esc' },
        ]}
        holdKey={{ value: 'ctrl+c', label: 'Ctrl-C', accessibleLabel: 'Hold to send Control C' }}
        onKey={setSent}
      />
      <Text tone="muted">Sent: {sent}</Text>
    </Stack>
  );
};
