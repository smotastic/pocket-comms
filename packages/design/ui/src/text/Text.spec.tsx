import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { Text } from './Text.js';
import styles from './Text.module.css';

afterEach(cleanup);

describe('Text', () => {
  it('is a paragraph by default', () => {
    render(<Text>Save links.</Text>);
    expect(screen.getByText('Save links.').tagName).toBe('P');
  });

  it('can be inline or a block of its own', () => {
    render(
      <>
        <Text as="span">inline</Text>
        <Text as="div">block</Text>
      </>,
    );
    expect(screen.getByText('inline').tagName).toBe('SPAN');
    expect(screen.getByText('block').tagName).toBe('DIV');
  });

  it('can be muted, small and cut to one line', () => {
    render(
      <Text tone="muted" size="sm" truncate>
        example.com
      </Text>,
    );
    const { classList } = screen.getByText('example.com');
    for (const name of [styles.muted, styles.sm, styles.truncate]) {
      expect(name).toMatch(/\w/);
      expect(classList).toContain(name);
    }
  });

  it('is default and medium unless told otherwise', () => {
    render(<Text>Save links.</Text>);
    const { classList } = screen.getByText('Save links.');
    expect(classList).not.toContain(styles.muted);
    expect(classList).not.toContain(styles.sm);
    expect(classList).not.toContain(styles.truncate);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Text tone="muted">Save links.</Text>);
    expect(await axeViolations(container)).toEqual([]);
  });
});
