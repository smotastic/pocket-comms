import type { Story } from '@ladle/react';
import { Button } from '../button/Button.js';
import { Stack } from '../layout/Stack.js';
import { IssueCard } from './IssueCard.js';

const actions = (
  <>
    <Button size="sm" variant="secondary">
      Implement
    </Button>
    <Button size="sm" variant="ghost">
      Close
    </Button>
  </>
);

export const Cards: Story = () => (
  <Stack gap="sm">
    <IssueCard number={24} title="Swipe back closes a sheet" meta="ux" actions={actions} />
    <IssueCard
      number={22}
      title="Push notification when an agent needs me, with a title long enough to wrap and be cut"
      meta="● comms-push is on it"
      actions={
        <Button size="sm" variant="ghost">
          Close
        </Button>
      }
    />
    <IssueCard
      number={19}
      title="Show the diff of a finished agent"
      question={{
        text: 'Close #19 in Gitea?',
        actions: (
          <>
            <Button size="sm" variant="danger">
              Close issue
            </Button>
            <Button size="sm" variant="ghost">
              Cancel
            </Button>
          </>
        ),
      }}
    />
  </Stack>
);
