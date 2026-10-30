import type { Story } from '@ladle/react';
import { Button } from '../button/Button.js';
import { Card } from '../card/Card.js';
import { Tag } from '../tag/Tag.js';
import { List, ListItem } from './List.js';

const actions = (
  <>
    <Button size="sm" variant="ghost">
      Archive
    </Button>
    <Button size="sm" variant="danger">
      Delete
    </Button>
  </>
);

export const InACard: Story = () => (
  <Card padding="none">
    <List aria-label="Bookmarks">
      <ListItem actions={actions}>
        Effect documentation <Tag>docs</Tag>
      </ListItem>
      <ListItem actions={actions}>
        Nx module boundaries <Tag>nx</Tag> <Tag>architecture</Tag>
      </ListItem>
    </List>
  </Card>
);

export const Empty: Story = () => (
  <Card padding="none">
    <List aria-label="Bookmarks" empty="No bookmarks yet.">
      {[]}
    </List>
  </Card>
);
