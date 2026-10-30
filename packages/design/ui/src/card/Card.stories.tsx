import type { Story } from '@ladle/react';
import { Alert } from '../alert/Alert.js';
import { Tag } from '../tag/Tag.js';
import { Card } from './Card.js';

export const Padded: Story = () => <Card>Content on a raised surface.</Card>;

export const AlertAndTags: Story = () => (
  <>
    <Alert>The URL is already saved.</Alert>
    <p>
      <Tag>docs</Tag> <Tag>effect</Tag>
    </p>
  </>
);
