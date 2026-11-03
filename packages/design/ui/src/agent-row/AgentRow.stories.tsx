import type { Story } from '@ladle/react';
import { Stack } from '../layout/Stack.js';
import { AgentList } from './AgentList.js';
import { AgentRow } from './AgentRow.js';

const navigate = () => undefined;

export const Rows: Story = () => (
  <Stack gap="md">
    <AgentList label="Needs you">
      <AgentRow
        href="#picard"
        onNavigate={navigate}
        status={{ tone: 'blocked', label: 'Needs you' }}
        name="picard-tanstack"
        worktree="feat-router"
        project="pocket-comms"
        hue={1}
        title="Which router should the web app use?"
        since="now"
        attention="blocked"
      />
      <AgentRow
        href="#nebula"
        onNavigate={navigate}
        status={{ tone: 'done', label: 'Done' }}
        name="nebula-ux-research"
        project="pocket-home"
        hue={2}
        title="App UX research and improvements"
        since="4m"
        attention="done"
      />
    </AgentList>
    <AgentList label="Waiting on background work">
      <AgentRow
        href="#scotty"
        onNavigate={navigate}
        status={{ tone: 'done', label: 'Done' }}
        name="scotty-ci"
        project="pocket-comms"
        hue={1}
        title="Ship once CI is green"
        since="2m"
        background={{ count: 2, label: '2 running in the background' }}
      />
    </AgentList>
    <AgentList label="Everything else">
      <AgentRow
        href="#spock"
        onNavigate={navigate}
        status={{ tone: 'working', label: 'Working' }}
        name="spock-chat-kit-with-a-very-long-name-that-truncates"
        worktree="feat-chat-kit-with-a-long-branch"
        project="pocket-comms"
        hue={1}
        title="Port chat components into the UI kit and check every story at phone width"
        since="12s"
      />
      <AgentRow
        href="#kirk"
        onNavigate={navigate}
        status={{ tone: 'idle', label: 'Idle' }}
        name="kirk"
        project="pocket-learning"
        hue={3}
        title="Multi-topic learning beyond Tulu"
        since="2h"
      />
      <AgentRow
        href="#w1p2"
        onNavigate={navigate}
        status={{ tone: 'unknown', label: 'Unknown' }}
        name="scratch"
        project="scratch"
        title="zsh"
        since="1d"
      />
    </AgentList>
  </Stack>
);

export const Hues: Story = () => (
  <AgentList label="Hues">
    {([1, 2, 3, 4, 5, 'neutral'] as const).map((hue) => (
      <AgentRow
        key={hue}
        href={`#${hue}`}
        onNavigate={navigate}
        status={{ tone: 'idle', label: 'Idle' }}
        name={`hue-${hue}`}
        project={`project ${hue}`}
        hue={hue}
        title="A row in this project's colour"
        since="1m"
      />
    ))}
  </AgentList>
);

export const WithoutALink: Story = () => (
  <AgentList label="Activity">
    <AgentRow
      status={{ tone: 'unknown', label: 'Gone' }}
      name="scotty"
      worktree="fix-notch"
      hue="neutral"
      title="Gone"
      since="2h"
    />
  </AgentList>
);
