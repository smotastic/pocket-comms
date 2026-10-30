import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { UserMessage } from './UserMessage.js';

afterEach(cleanup);

describe('UserMessage', () => {
  it('labels the message "You" by default', () => {
    const { container } = render(<UserMessage>Run the tests</UserMessage>);
    expect(container.textContent).toBe('YouRun the tests');
    expect(screen.getByText('You')).toBeDefined();
  });

  it('takes another label', () => {
    render(<UserMessage label="Owner">Hi</UserMessage>);
    expect(screen.getByText('Owner')).toBeDefined();
  });

  it('keeps the line breaks of the message', () => {
    render(<UserMessage>{'one\ntwo'}</UserMessage>);
    expect(screen.getByText(/one/).textContent).toBe('one\ntwo');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<UserMessage>Hello</UserMessage>);
    expect(await axeViolations(container)).toEqual([]);
  });
});
