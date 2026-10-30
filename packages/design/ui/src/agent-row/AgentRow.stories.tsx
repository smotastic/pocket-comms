import type { Story } from '@ladle/react';
import { Stack } from '../layout/Stack.js';
import { StatusPill } from '../status-pill/StatusPill.js';
import { AgentRow } from './AgentRow.js';

const navigate = () => undefined;

export const Rows: Story = () => (
  <Stack gap="sm">
    <AgentRow
      href="#picard"
      onNavigate={navigate}
      kind={{ mark: 'π', label: 'Pi', tone: 'pi' }}
      name="picard-tanstack"
      status={<StatusPill tone="blocked" label="Needs you" />}
      detail="Needs your answer"
      since="now"
      attention="blocked"
    />
    <AgentRow
      href="#nebula"
      onNavigate={navigate}
      kind={{ mark: 'C', label: 'Claude', tone: 'claude' }}
      name="nebula-ux-research"
      status={<StatusPill tone="done" label="Done" />}
      detail="App UX research and improvements"
      since="4m"
      attention="done"
    />
    <AgentRow
      href="#spock"
      onNavigate={navigate}
      kind={{ mark: 'C', label: 'Claude', tone: 'claude' }}
      name="spock-chat-kit-with-a-very-long-name-that-truncates"
      status={<StatusPill tone="working" label="Working" />}
      detail="Port chat components into the UI kit and check every story at phone width"
      since="12s"
    />
    <AgentRow
      href="#w1p2"
      onNavigate={navigate}
      kind={{ mark: 'co', label: 'codex', tone: 'other' }}
      name="w1:p2"
      status={<StatusPill tone="idle" label="Idle" />}
      detail="zsh"
      since="2h"
    />
  </Stack>
);
