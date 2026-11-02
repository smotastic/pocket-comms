import type { Story } from '@ladle/react';
import { useState } from 'react';
import { FilterChips } from './FilterChips.js';

export const Projects: Story = () => {
  const [value, setValue] = useState('all');
  return (
    <FilterChips
      label="Project"
      value={value}
      onChange={setValue}
      options={[
        { value: 'all', label: 'All' },
        { value: 'pocket-comms', label: 'pocket-comms', hue: 1 },
        { value: 'pocket-home', label: 'pocket-home', hue: 2 },
        { value: 'other', label: 'Other', hue: 'neutral' },
      ]}
    />
  );
};
