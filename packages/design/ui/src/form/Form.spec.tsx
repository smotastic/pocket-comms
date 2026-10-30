import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../button/Button.js';
import { axeViolations } from '../testing/a11y.js';
import { Form } from './Form.js';
import styles from './Form.module.css';
import { Input } from './Input.js';

afterEach(cleanup);

// A form without an accessible name must not compile.
// @ts-expect-error -- `aria-label` or `aria-labelledby` is required.
const _unnamed = () => <Form />;

const NewBookmark = ({ onSubmit }: { readonly onSubmit: () => void }) => (
  <Form
    aria-label="New bookmark"
    columns={2}
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
    actions={<Button type="submit">Add</Button>}
  >
    <Input label="URL" hideLabel span="full" />
    <Input label="Title" hideLabel />
    <Input label="Tags" hideLabel />
  </Form>
);

describe('Form', () => {
  it('is a form named by its label', () => {
    render(<NewBookmark onSubmit={() => undefined} />);
    expect(screen.getByRole('form', { name: 'New bookmark' })).toBeDefined();
  });

  it('submits with Enter in a field and with its submit action', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<NewBookmark onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Docs{Enter}');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('lays its fields out in the given number of columns', () => {
    render(<NewBookmark onSubmit={() => undefined} />);
    expect(styles.columns2).toMatch(/\w/);
    expect(screen.getByRole('form').classList).toContain(styles.columns2);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<NewBookmark onSubmit={() => undefined} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
