import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { SectionHeader } from './SectionHeader.js';

afterEach(cleanup);

describe('SectionHeader', () => {
  it('is a level 2 heading by default', () => {
    render(<SectionHeader title="Needs you" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Needs you' })).toBeDefined();
  });

  it('can be a level 3 heading', () => {
    render(<SectionHeader title="pocket-home" level={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'pocket-home' })).toBeDefined();
  });

  it('shows the count after the title', () => {
    render(<SectionHeader title="Needs you" count={2} />);
    expect(screen.getByRole('heading').textContent).toBe('Needs you 2');
  });

  it('shows a count of zero', () => {
    render(<SectionHeader title="Idle" count={0} />);
    expect(screen.getByRole('heading').textContent).toBe('Idle 0');
  });

  it('can link its title, such as to the page of what it lists', () => {
    const opened: Array<string> = [];
    render(
      <SectionHeader
        title="pocket-home"
        count={2}
        link={{
          href: '/projects/pocket-home',
          label: 'Open pocket-home',
          onNavigate: () => opened.push('pocket-home'),
        }}
      />,
    );
    const link = screen.getByRole('link', { name: 'Open pocket-home' });
    expect(link.getAttribute('href')).toBe('/projects/pocket-home');
    expect(screen.getByRole('heading').textContent).toBe('pocket-home› 2');

    fireEvent.click(link);
    expect(opened).toEqual(['pocket-home']);
  });

  it('leaves a click with a modifier to the browser', () => {
    const opened: Array<string> = [];
    render(
      <SectionHeader
        title="pocket-home"
        link={{ href: '/p', label: 'Open pocket-home', onNavigate: () => opened.push('p') }}
      />,
    );
    fireEvent.click(screen.getByRole('link'), { metaKey: true });
    expect(opened).toEqual([]);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <>
        <SectionHeader title="Needs you" count={1} />
        <SectionHeader
          title="pocket-home"
          count={1}
          link={{ href: '/p', label: 'Open pocket-home', onNavigate: () => undefined }}
        />
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
