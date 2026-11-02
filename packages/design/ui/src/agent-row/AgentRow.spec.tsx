import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { AgentList } from './AgentList.js';
import { AgentRow, type AgentRowProps } from './AgentRow.js';
import styles from './AgentRow.module.css';

afterEach(cleanup);

const row = (props: Partial<AgentRowProps> = {}) =>
  render(
    <AgentRow
      href="/agents/kirk"
      onNavigate={() => undefined}
      status={{ tone: 'idle', label: 'Idle' }}
      name="kirk"
      title="Ingestor MVP discussion"
      since="2h"
      {...props}
    />,
  );

const link = () => screen.getByRole('link');

describe('AgentRow', () => {
  it('is a link to the agent named by its name, status, title and last change', () => {
    row();
    expect(link().getAttribute('href')).toBe('/agents/kirk');
    expect(
      screen.getByRole('link', { name: 'kirk Idle Ingestor MVP discussion 2h' }),
    ).toBeDefined();
  });

  it('shows the worktree after the name', () => {
    row({ worktree: 'fix-pwa-notch' });
    expect(link().textContent).toMatch(/kirk.*· fix-pwa-notch.*Idle/);
  });

  it('shows the project label before the title', () => {
    row({ project: 'pocket-comms' });
    expect(link().textContent).toMatch(/pocket-comms.*Ingestor MVP discussion/);
    expect(screen.getByText('pocket-comms').classList).toContain(styles.project);
  });

  it('says its status in words and hides the dot', () => {
    row({ status: { tone: 'working', label: 'Working' } });
    const dot = link().querySelector(`.${styles.dot}`);
    expect(dot?.getAttribute('aria-hidden')).toBe('true');
    expect(dot?.classList).toContain(styles.dotWorking);
    expect(screen.getByText('Working')).toBeDefined();
  });

  it.each([
    [1, 'hue1'],
    [5, 'hue5'],
    ['neutral', 'hueNeutral'],
  ] as const)('takes the colour of hue %s', (hue, name) => {
    row({ hue });
    expect(styles[name]).toMatch(/\w/);
    expect(link().classList).toContain(styles[name]);
  });

  it('is neutral without a hue', () => {
    row();
    expect(link().classList).toContain(styles.hueNeutral);
  });

  it('navigates in the app on a plain click', async () => {
    const onNavigate = vi.fn();
    row({ onNavigate });
    await userEvent.click(link());
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('navigates on Enter', async () => {
    const onNavigate = vi.fn();
    row({ onNavigate });
    link().focus();
    await userEvent.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('leaves a modified click to the browser', () => {
    const onNavigate = vi.fn();
    row({ onNavigate });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
    link().dispatchEvent(event);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    fireEvent.click(link(), { button: 1 });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it.each(['blocked', 'done'] as const)('tints the %s attention', (attention) => {
    row({ attention });
    expect(styles[attention]).toMatch(/\w/);
    expect(link().classList).toContain(styles[attention]);
  });

  it('has no accessibility violations', async () => {
    const { container } = row({
      attention: 'blocked',
      worktree: 'ingestor-mvp',
      project: 'pocket-home',
      hue: 2,
    });
    expect(await axeViolations(container)).toEqual([]);
  });
});

const listOf = (names: ReadonlyArray<string>) => (
  <AgentList label="Agents">
    {names.map((name) => (
      <AgentRow
        key={name}
        href={`/agents/${name}`}
        onNavigate={() => undefined}
        status={{ tone: 'idle', label: 'Idle' }}
        name={name}
        title={name}
        since="now"
      />
    ))}
  </AgentList>
);

describe('AgentList', () => {
  it('keeps a row when the list reorders', () => {
    const { rerender } = render(listOf(['a', 'b']));
    const b = screen.getByRole('link', { name: /^b/ });
    rerender(listOf(['b', 'a']));
    expect(screen.getByRole('link', { name: /^b/ })).toBe(b);
  });

  it('is a named list with one item per row', () => {
    render(
      <AgentList label="Needs you">
        <AgentRow
          href="/agents/a"
          onNavigate={() => undefined}
          status={{ tone: 'blocked', label: 'Needs you' }}
          name="a"
          title="A"
          since="now"
        />
        <AgentRow
          href="/agents/b"
          onNavigate={() => undefined}
          status={{ tone: 'done', label: 'Done' }}
          name="b"
          title="B"
          since="4m"
        />
      </AgentList>,
    );
    const list = screen.getByRole('list', { name: 'Needs you' });
    expect(list.querySelectorAll('li')).toHaveLength(2);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <AgentList label="Agents">
        <AgentRow
          href="/agents/a"
          onNavigate={() => undefined}
          status={{ tone: 'idle', label: 'Idle' }}
          name="a"
          title="A"
          since="now"
        />
      </AgentList>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
