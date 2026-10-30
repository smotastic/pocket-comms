import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { Avatar } from './Avatar.js';
import styles from './Avatar.module.css';

afterEach(cleanup);

describe('Avatar', () => {
  it('is a round mark with initials, hidden from a screen reader beside a name', () => {
    const { container } = render(<Avatar initials="C" />);
    const mark = container.firstElementChild;
    expect(mark?.textContent).toBe('C');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    expect(mark?.classList).toContain(styles.avatar);
    expect(mark?.classList).toContain(styles.md);
  });

  it('is an image named by its label when it stands alone', () => {
    render(<Avatar initials="C" label="Assistant" />);
    const image = screen.getByRole('img', { name: 'Assistant' });
    expect(image.textContent).toBe('C');
  });

  it('fills its container, such as a round button', () => {
    const { container } = render(<Avatar initials="C" size="fill" />);
    expect(container.firstElementChild?.classList).toContain(styles.fill);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <>
        <Avatar initials="C" />
        <Avatar initials="C" label="Assistant" />
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
