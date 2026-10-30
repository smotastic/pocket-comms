import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { IconButton } from '../icon-button/IconButton.js';
import { axeViolations } from '../testing/a11y.js';
import { TopBar } from './TopBar.js';

afterEach(cleanup);

describe('TopBar', () => {
  it('is a banner whose title is the page heading', () => {
    render(<TopBar title="pocket-comms" subtitle="Mac mini" />);
    expect(screen.getByRole('banner')).toBeDefined();
    expect(screen.getByRole('heading', { level: 1, name: 'pocket-comms' })).toBeDefined();
    expect(screen.getByText('Mac mini')).toBeDefined();
  });

  it('places content before and after the title', () => {
    render(
      <TopBar
        title="kirk"
        start={<IconButton icon="close" label="Back" />}
        end={<span>Chat</span>}
      />,
    );
    const banner = screen.getByRole('banner');
    const text = banner.textContent ?? '';
    expect(screen.getByRole('button', { name: 'Back' })).toBeDefined();
    expect(text.indexOf('kirk')).toBeLessThan(text.indexOf('Chat'));
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<TopBar title="pocket-comms" subtitle="live" />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
