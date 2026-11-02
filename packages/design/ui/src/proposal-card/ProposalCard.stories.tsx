import type { Story } from '@ladle/react';
import { useState } from 'react';
import { Stack } from '../layout/Stack.js';
import { ProposalCard, type ProposalCardProps } from './ProposalCard.js';

const draft = {
  project: 'pocket-home',
  title: 'Dark mode',
  body: 'A toggle in the settings that switches the app to dark colours.',
  projects: ['pocket-comms', 'pocket-home', 'pocket-learning'],
};

export const Open: Story = () => {
  const [state, setState] = useState<ProposalCardProps['state']>({ _tag: 'open' });
  return (
    <Stack gap="md">
      <ProposalCard
        {...draft}
        state={state}
        onCreate={() =>
          setState({ _tag: 'created', number: 12, url: 'http://localhost:3000/issues/12' })
        }
        onDiscard={() => setState({ _tag: 'discarded' })}
      />
    </Stack>
  );
};

export const Failed: Story = () => (
  <ProposalCard
    {...draft}
    state={{ _tag: 'open' }}
    error="Gitea refused the token (403)."
    onCreate={() => undefined}
    onDiscard={() => undefined}
  />
);

export const Decided: Story = () => (
  <Stack gap="md">
    <ProposalCard
      {...draft}
      state={{ _tag: 'created', number: 12, url: 'http://localhost:3000/issues/12' }}
      onCreate={() => undefined}
      onDiscard={() => undefined}
    />
    <ProposalCard
      {...draft}
      state={{ _tag: 'discarded' }}
      onCreate={() => undefined}
      onDiscard={() => undefined}
    />
  </Stack>
);
