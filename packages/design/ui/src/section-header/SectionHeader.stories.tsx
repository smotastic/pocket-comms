import type { Story } from '@ladle/react';
import { SectionHeader } from './SectionHeader.js';

export const WithCount: Story = () => <SectionHeader title="Needs you" count={2} />;

export const WithoutCount: Story = () => <SectionHeader title="pocket-factory" />;

export const WithLink: Story = () => (
  <SectionHeader
    title="pocket-home"
    count={3}
    link={{ href: '#', label: 'Open pocket-home', onNavigate: () => undefined }}
  />
);
