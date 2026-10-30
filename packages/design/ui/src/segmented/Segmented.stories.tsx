import type { Story } from '@ladle/react';
import { useState } from 'react';
import { Segmented } from './Segmented.js';

export const ChatOrScreen: Story = () => {
  const [view, setView] = useState('chat');
  return (
    <Segmented
      label="View"
      options={[
        { value: 'chat', label: 'Chat' },
        { value: 'screen', label: 'Screen' },
      ]}
      value={view}
      onChange={setView}
    />
  );
};
