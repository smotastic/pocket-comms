import type { Story } from '@ladle/react';
import { Stack } from '../layout/Stack.js';
import { LiveIndicator } from './LiveIndicator.js';

export const States: Story = () => (
  <Stack gap="sm">
    <LiveIndicator live label="Mac mini · live" />
    <LiveIndicator live={false} label="Reconnecting…" />
  </Stack>
);
