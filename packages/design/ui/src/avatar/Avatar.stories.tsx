import type { Story } from '@ladle/react';
import { Inline } from '../layout/Inline.js';
import { Avatar } from './Avatar.js';

export const Initials: Story = () => (
  <Inline gap="md">
    <Avatar initials="C" label="Assistant" />
    <Avatar initials="NS" label="Nils" />
  </Inline>
);
