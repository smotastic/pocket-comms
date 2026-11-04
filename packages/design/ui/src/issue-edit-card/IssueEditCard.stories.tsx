import type { Story } from '@ladle/react';
import { useState } from 'react';
import { Stack } from '../layout/Stack.js';
import { IssueEditCard, type IssueEditCardProps } from './IssueEditCard.js';

const edit = {
  project: 'pocket-comms',
  number: 11,
  url: 'http://localhost:3000/smotastic/pocket-comms/issues/11',
  title: 'Orchestrator mode from the brainstorm chat',
  body: '## Idea\n\nControl the agents from the brainstorm chat instead of a separate orchestrator agent.\n\n## Why\n\nOne place to talk to every agent.',
  base: {
    title: 'Orchestrator mode',
    body: '## Idea\n\nAn orchestrator agent that starts and steers the other agents.\n\n## Why\n\nOne place to talk to every agent.',
  },
};

export const Open: Story = () => {
  const [state, setState] = useState<IssueEditCardProps['state']>({ _tag: 'open' });
  return (
    <Stack gap="md">
      <IssueEditCard
        {...edit}
        state={state}
        onApply={() => setState({ _tag: 'updated', url: edit.url })}
        onDiscard={() => setState({ _tag: 'discarded' })}
      />
    </Stack>
  );
};

export const Changed: Story = () => (
  <IssueEditCard
    {...edit}
    state={{ _tag: 'open' }}
    error="Issue #11 changed since Pi read it, so the edit was not applied. Discard it and ask Pi to read the issue again."
    onApply={() => undefined}
    onDiscard={() => undefined}
  />
);

export const Decided: Story = () => (
  <Stack gap="md">
    <IssueEditCard
      {...edit}
      state={{ _tag: 'updated', url: edit.url }}
      onApply={() => undefined}
      onDiscard={() => undefined}
    />
    <IssueEditCard
      {...edit}
      state={{ _tag: 'discarded' }}
      onApply={() => undefined}
      onDiscard={() => undefined}
    />
  </Stack>
);
