import type { Story } from '@ladle/react';
import { UserMessage } from './UserMessage.js';

export const Prompt: Story = () => (
  <UserMessage>
    Read your brief and carry it out autonomously until its &apos;Done when&apos; list is complete.
  </UserMessage>
);
