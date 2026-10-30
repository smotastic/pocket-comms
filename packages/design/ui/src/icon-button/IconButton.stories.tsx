import type { Story } from '@ladle/react';
import { useState } from 'react';
import { Inline } from '../layout/Inline.js';
import { ICON_NAMES } from './Icon.js';
import { IconButton } from './IconButton.js';

export const All: Story = () => (
  <Inline gap="xs">
    {ICON_NAMES.map((name) => (
      <IconButton key={name} icon={name} label={name} />
    ))}
  </Inline>
);

export const Toggle: Story = () => {
  const [on, setOn] = useState(true);
  return <IconButton icon="history" label="History" pressed={on} onClick={() => setOn(!on)} />;
};

export const Primary: Story = () => (
  <Inline gap="sm">
    <IconButton icon="send" label="Send" tone="primary" />
    <IconButton icon="send" label="Send" tone="primary" disabled />
  </Inline>
);
