import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { Alert } from './Alert.js';

afterEach(cleanup);

describe('Alert', () => {
  it('announces its message to assistive technology', () => {
    render(<Alert>The URL is already saved.</Alert>);
    expect(screen.getByRole('alert').textContent).toBe('The URL is already saved.');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Alert>The URL is already saved.</Alert>);
    expect(await axeViolations(container)).toEqual([]);
  });
});
