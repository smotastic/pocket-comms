import type { Story } from '@ladle/react';
import { useState } from 'react';
import { BackgroundStrip } from './BackgroundStrip.js';

const items = [
  { id: 't1', kind: 'Command', description: 'Wait for CI on PR 31', since: '12m' },
  { id: 't2', kind: 'Monitor', description: 'Watch the server log', since: '4m' },
  {
    id: 't3',
    kind: 'Subagent',
    description: 'Review the images branch diff',
    since: '1m',
    href: '#subagent',
    onNavigate: () => undefined,
  },
];

export const Running: Story = () => {
  const [expanded, setExpanded] = useState(true);
  return (
    <BackgroundStrip items={items} expanded={expanded} onToggle={() => setExpanded(!expanded)} />
  );
};

export const Collapsed: Story = () => {
  const [expanded, setExpanded] = useState(false);
  return (
    <BackgroundStrip
      items={items.slice(0, 1)}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
    />
  );
};
