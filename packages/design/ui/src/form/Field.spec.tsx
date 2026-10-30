import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Field } from './Field.js';
import styles from './Field.module.css';

afterEach(cleanup);

describe('Field', () => {
  it('labels and describes any control', () => {
    render(
      <Field label="Status" error="Pick a status.">
        {(control) => (
          <select {...control}>
            <option>active</option>
          </select>
        )}
      </Field>,
    );
    const select = screen.getByRole('combobox', { name: 'Status' });
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(
      document.getElementById(select.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Pick a status.');
  });

  it('spans the full form width when asked to', () => {
    const { container } = render(
      <Field label="URL" span="full">
        {(control) => <input {...control} />}
      </Field>,
    );
    expect(styles.full).toMatch(/\w/);
    expect(container.firstElementChild?.classList).toContain(styles.full);
  });
});
