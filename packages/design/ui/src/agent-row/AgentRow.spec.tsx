import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusPill } from '../status-pill/StatusPill.js';
import { axeViolations } from '../testing/a11y.js';
import { AgentRow, type AgentRowProps } from './AgentRow.js';
import styles from './AgentRow.module.css';

afterEach(cleanup);

const row = (props: Partial<AgentRowProps> = {}) =>
  render(
    <AgentRow
      href="/agents/kirk"
      onNavigate={() => undefined}
      kind={{ mark: 'C', label: 'Claude', tone: 'claude' }}
      name="kirk"
      status={<StatusPill tone="idle" label="Idle" />}
      detail="Ingestor MVP discussion"
      since="2h"
      {...props}
    />,
  );

const link = () => screen.getByRole('link');

describe('AgentRow', () => {
  it('is a link to the agent whose name starts with the kind and the agent name', () => {
    row();
    expect(link().getAttribute('href')).toBe('/agents/kirk');
    expect(link().textContent).toContain('kirk');
    expect(link().textContent).toContain('Ingestor MVP discussion · 2h');
    expect(screen.getByRole('link', { name: /^Claude kirk Idle/ })).toBeDefined();
  });

  it('hides the kind mark and names the kind instead', () => {
    row({ kind: { mark: 'π', label: 'Pi', tone: 'pi' } });
    expect(screen.getByText('π').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('Pi')).toBeDefined();
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

  it.each(['blocked', 'done'] as const)('marks the %s attention', (attention) => {
    row({ attention });
    expect(styles[attention]).toMatch(/\w/);
    expect(link().classList).toContain(styles[attention]);
  });

  it('shows a tag before the detail, in its own box', () => {
    row({ tag: 'pocket-home · ingestor-mvp' });
    const tag = screen.getByText('pocket-home · ingestor-mvp');
    expect(tag.closest(`.${styles.tag}`)).not.toBe(null);
    expect(link().textContent).toMatch(/pocket-home · ingestor-mvp.*Ingestor MVP discussion · 2h/);
  });

  it('shows no tag box without a tag', () => {
    row();
    expect(link().querySelector(`.${styles.tag}`)).toBe(null);
  });

  it('takes the tone of its kind', () => {
    row({ kind: { mark: 'X', label: 'codex', tone: 'other' } });
    expect(screen.getByText('X').classList).toContain(styles.other);
  });

  it('has no accessibility violations', async () => {
    const { container } = row({ attention: 'blocked', tag: 'ingestor-mvp' });
    expect(await axeViolations(container)).toEqual([]);
  });
});
