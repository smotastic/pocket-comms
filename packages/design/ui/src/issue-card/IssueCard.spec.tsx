import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '../button/Button.js';
import { axeViolations } from '../testing/a11y.js';
import { IssueCard, type IssueCardProps } from './IssueCard.js';
import styles from './IssueCard.module.css';

afterEach(cleanup);

const card = (props: Partial<IssueCardProps> = {}) =>
  render(
    <IssueCard
      number={24}
      title="Swipe back closes a sheet"
      meta="ux · feature"
      actions={<Button size="sm">Implement</Button>}
      {...props}
    />,
  );

describe('IssueCard', () => {
  it('is an article named by the issue, with its number and title first', () => {
    card();
    const article = screen.getByRole('article', { name: '#24 Swipe back closes a sheet' });
    expect(article.textContent).toMatch(/^#24 Swipe back closes a sheet/);
    expect(within(article).getByText('Swipe back closes a sheet').classList).toContain(
      styles.title,
    );
  });

  it('shows the meta line with the actions at its end', () => {
    card();
    const article = screen.getByRole('article');
    expect(article.textContent).toMatch(/ux · feature.*Implement$/);
  });

  it('shows a question instead of the meta line and the actions', () => {
    card({
      question: { text: 'Close #24 in Gitea?', actions: <Button size="sm">Close issue</Button> },
    });
    const article = screen.getByRole('article');
    expect(within(article).getByText('Close #24 in Gitea?')).toBeDefined();
    expect(within(article).queryByText('ux · feature')).toBeNull();
    expect(within(article).queryByRole('button', { name: 'Implement' })).toBeNull();
    expect(within(article).getByRole('button', { name: 'Close issue' })).toBeDefined();
  });

  it('has no accessibility violations', async () => {
    const { container } = card();
    expect(await axeViolations(container)).toEqual([]);
  });
});
