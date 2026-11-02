import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DockedPage } from '../layout/DockedPage.js';
import { axeViolations } from '../testing/a11y.js';
import { Fab } from './Fab.js';
import styles from './Fab.module.css';

afterEach(cleanup);

describe('Fab', () => {
  it('is a button named by its label, reached with Tab', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Fab icon="brainstorm" label="Brainstorm" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Brainstorm' });
    expect(button.getAttribute('type')).toBe('button');
    await user.tab();
    expect(document.activeElement).toBe(button);
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('has no badge by default, and a badge described by its text', () => {
    const { rerender } = render(<Fab icon="brainstorm" label="Brainstorm" />);
    const button = screen.getByRole('button', { name: 'Brainstorm' });
    expect(button.hasAttribute('aria-describedby')).toBe(false);
    expect(button.querySelector(`.${styles.badge}`)).toBeNull();

    rerender(<Fab icon="brainstorm" label="Brainstorm" badge="Pi is answering" />);
    const description = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toBe('Pi is answering');
  });

  it('floats above the footer of a docked page while that page is shown', () => {
    const root = document.documentElement.style;
    const { unmount } = render(
      <DockedPage header={<h1>Chat</h1>} footer={<p>Composer</p>} label="Conversation">
        <p>Body</p>
      </DockedPage>,
    );
    expect(root.getPropertyValue('--docked-footer-height')).toMatch(/px$/u);
    unmount();
    expect(root.getPropertyValue('--docked-footer-height')).toBe('');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Fab icon="brainstorm" label="Brainstorm" badge="Pi is answering" />,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
