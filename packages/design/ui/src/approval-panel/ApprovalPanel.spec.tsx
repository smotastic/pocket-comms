import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { ApprovalPanel } from './ApprovalPanel.js';

afterEach(cleanup);

describe('ApprovalPanel', () => {
  it('is a region named by its heading', () => {
    render(
      <ApprovalPanel title="Claude asks to run">
        <p>git push</p>
      </ApprovalPanel>,
    );
    const region = screen.getByRole('region', { name: 'Claude asks to run' });
    expect(screen.getByRole('heading', { level: 2, name: 'Claude asks to run' })).toBeDefined();
    expect(region.textContent).toContain('git push');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <ApprovalPanel title="Needs your answer">
        <p>Allow?</p>
      </ApprovalPanel>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
