import type { Story } from '@ladle/react';
import { IconButton } from '../icon-button/IconButton.js';
import { LiveIndicator } from '../live-indicator/LiveIndicator.js';
import { StatusPill } from '../status-pill/StatusPill.js';
import { TopBar } from './TopBar.js';

export const Overview: Story = () => (
  <TopBar title="pocket-comms" subtitle={<LiveIndicator live label="Mac mini · live" />} />
);

export const Conversation: Story = () => (
  <TopBar
    start={<IconButton icon="back" label="Back to all agents" />}
    title="picard-tanstack"
    subtitle={<StatusPill tone="working" label="Working" />}
  />
);
