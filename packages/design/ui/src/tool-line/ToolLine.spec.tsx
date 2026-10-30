import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { ToolLine } from './ToolLine.js';
import styles from './ToolLine.module.css';

afterEach(cleanup);

describe('ToolLine', () => {
  it('shows the verb and the target as code', () => {
    const { container } = render(<ToolLine verb="Read" target="apps/web/src/main.tsx" />);
    expect(container.textContent).toBe('Read apps/web/src/main.tsx');
    expect(screen.getByText('apps/web/src/main.tsx').tagName).toBe('CODE');
  });

  it('shows the lines added and removed', () => {
    const { container } = render(<ToolLine verb="Edited" target="foo.ts" added={12} removed={3} />);
    expect(container.textContent).toBe('Edited foo.ts +12 −3');
    expect(screen.getByText('+12').classList).toContain(styles.added);
    expect(screen.getByText('−3').classList).toContain(styles.removed);
  });

  it('leaves out a zero count', () => {
    const { container } = render(<ToolLine verb="Wrote" target="a.md" added={4} removed={0} />);
    expect(container.textContent).toBe('Wrote a.md +4');
  });

  it('marks a success and names it for a screen reader', () => {
    render(<ToolLine verb="Ran" target="pnpm test" outcome="ok" />);
    expect(screen.getByText('✓').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('succeeded')).toBeDefined();
  });

  it('marks a failure and names it for a screen reader', () => {
    render(<ToolLine verb="Ran" target="pnpm test" outcome="error" />);
    expect(screen.getByText('✗').classList).toContain(styles.error);
    expect(screen.getByText('failed')).toBeDefined();
  });

  it('shows no mark while the call is pending', () => {
    const { container } = render(<ToolLine verb="Ran" target="pnpm test" outcome="pending" />);
    expect(container.textContent).toBe('Ran pnpm test');
  });

  it('can have no target', () => {
    const { container } = render(<ToolLine verb="Thought" />);
    expect(container.textContent).toBe('Thought');
    expect(container.querySelector('code')).toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <ToolLine verb="Edited" target="foo.ts" added={1} removed={2} outcome="ok" />,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
