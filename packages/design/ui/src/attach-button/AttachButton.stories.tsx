import type { Story } from '@ladle/react';
import { useState } from 'react';
import { Stack } from '../layout/Stack.js';
import { Text } from '../text/Text.js';
import { AttachButton } from './AttachButton.js';

export const PickImages: Story = () => {
  const [names, setNames] = useState<ReadonlyArray<string>>([]);
  return (
    <Stack gap="sm">
      <AttachButton
        label="Attach image"
        onFiles={(files) => setNames(files.map((file) => file.name))}
      />
      <Text>{names.length === 0 ? 'Nothing picked yet.' : names.join(', ')}</Text>
    </Stack>
  );
};

export const Disabled: Story = () => (
  <AttachButton label="Attach image" onFiles={() => undefined} disabled />
);
