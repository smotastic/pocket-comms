import type { Story } from '@ladle/react';
import { Text } from '../text/Text.js';
import { ApprovalPanel } from './ApprovalPanel.js';

export const Question: Story = () => (
  <ApprovalPanel title="Pi needs your answer">
    <Text>Allow `git push -u origin feat/web-tanstack`?</Text>
  </ApprovalPanel>
);
