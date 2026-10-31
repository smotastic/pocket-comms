import type { Story } from '@ladle/react';
import { Inline } from '../layout/Inline.js';
import { StatusPill } from './StatusPill.js';

export const Tones: Story = () => (
  <Inline gap="sm">
    <StatusPill tone="working" label="Working" />
    <StatusPill tone="blocked" label="Needs you" />
    <StatusPill tone="done" label="Done" />
    <StatusPill tone="idle" label="Idle" />
    <StatusPill tone="unknown" label="Unknown" />
  </Inline>
);
