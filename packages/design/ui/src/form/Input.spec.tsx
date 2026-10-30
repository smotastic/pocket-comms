import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import fieldStyles from './Field.module.css';
import { Input } from './Input.js';

afterEach(cleanup);

// An input without a label must not compile.
// @ts-expect-error -- `label` is required.
const _unlabeled = () => <Input />;

const Controlled = () => {
  const [value, setValue] = useState('');
  return <Input label="Title" value={value} onChange={(event) => setValue(event.target.value)} />;
};

describe('Input', () => {
  it('is a text box named by its label', () => {
    render(<Input label="URL" />);
    expect(screen.getByRole('textbox', { name: 'URL' })).toBeDefined();
  });

  it('keeps its accessible name when the label is visually hidden', () => {
    render(<Input label="URL" hideLabel />);
    expect(screen.getByRole('textbox', { name: 'URL' })).toBeDefined();
    expect(fieldStyles.visuallyHidden).toMatch(/\w/);
    expect(screen.getByText('URL').classList).toContain(fieldStyles.visuallyHidden);
  });

  it('is reached with Tab and takes typed text', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.tab();
    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(document.activeElement).toBe(input);
    await user.keyboard('Effect docs');
    expect((input as HTMLInputElement).value).toBe('Effect docs');
  });

  it('marks itself invalid and is described by its error', () => {
    render(<Input label="URL" error="Enter an absolute URL." />);
    const input = screen.getByRole('textbox', { name: 'URL' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const description = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toBe('Enter an absolute URL.');
  });

  it('is valid without an error', () => {
    render(<Input label="URL" />);
    const input = screen.getByRole('textbox', { name: 'URL' });
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });

  it('has no accessibility violations, with a visible, a hidden or an erroneous label', async () => {
    const { container } = render(
      <>
        <Input label="URL" />
        <Input label="Title" hideLabel />
        <Input label="Tags" error="Too many tags." />
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
