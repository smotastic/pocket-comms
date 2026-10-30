import type { Story } from '@ladle/react';
import { Stack } from '../layout/Stack.js';
import { Activity } from './Activity.js';

export const Activities: Story = () => (
  <Stack gap="md">
    <Activity label="Thinking…" />
    <Activity label="Reading the files…" />
    <Activity label="Saving the memory…" />
  </Stack>
);
