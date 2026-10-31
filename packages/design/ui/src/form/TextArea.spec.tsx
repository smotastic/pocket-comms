import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { TextArea } from './TextArea.js';

afterEach(cleanup);

// A text area without a label must not compile.
// @ts-expect-error -- `label` is required.
const _unlabeled = () => <TextArea />;

const Controlled = () => {
  const [value, setValue] = useState('');
  return <TextArea label="Task" value={value} onChange={(event) => setValue(event.target.value)} />;
};

describe('TextArea', () => {
  it('is a multi-line text box named by its label', () => {
    render(<TextArea label="Task" />);
    const box = screen.getByRole('textbox', { name: 'Task' });
    expect(box.tagName).toBe('TEXTAREA');
    expect(box.getAttribute('rows')).toBe('4');
  });

  it('takes several lines of typed text', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.tab();
    await user.keyboard('One{Enter}Two');
    expect((screen.getByRole('textbox', { name: 'Task' }) as HTMLTextAreaElement).value).toBe(
      'One\nTwo',
    );
  });

  it('marks itself invalid and is described by its error', () => {
    render(<TextArea label="Task" error="Describe the task first." />);
    const box = screen.getByRole('textbox', { name: 'Task' });
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(box.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Describe the task first.',
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <>
        <TextArea label="Task" />
        <TextArea label="Notes" error="Too long." />
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
