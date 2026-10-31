import type { Story } from '@ladle/react';
import { SectionHeader } from './SectionHeader.js';

export const WithCount: Story = () => <SectionHeader title="Needs you" count={2} />;

export const WithoutCount: Story = () => <SectionHeader title="pocket-factory" />;
