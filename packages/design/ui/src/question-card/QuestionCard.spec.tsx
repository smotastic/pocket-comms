import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { QuestionCard } from './QuestionCard.js';

afterEach(cleanup);

const questions = [
  { header: 'Stack', text: 'Keep Effect as the backend stack?', answer: 'Keep Effect' },
  { header: 'Projects', text: 'Which projects?', answer: 'Backend, Web' },
];

describe('QuestionCard', () => {
  it('lists each question in order with its header and answer', () => {
    render(<QuestionCard questions={questions} state="answered" />);
    const items = within(screen.getByRole('list', { name: 'Questions' })).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'StackKeep Effect as the backend stack?Answer: Keep Effect',
      'ProjectsWhich projects?Answer: Backend, Web',
    ]);
  });

  it('says it waits while the questions have no answer', () => {
    render(<QuestionCard questions={[{ text: 'Keep Nx?' }]} state="waiting" />);
    expect(screen.getByText('Keep Nx?')).toBeDefined();
    expect(screen.getByText('Waiting for your answer')).toBeDefined();
  });

  it('says the questions were not answered', () => {
    render(<QuestionCard questions={[{ text: 'Keep Nx?' }]} state="unanswered" />);
    expect(screen.getByText('Not answered')).toBeDefined();
  });

  it('says a question was answered when its answer is not known', () => {
    render(<QuestionCard questions={[{ text: 'Keep Nx?' }]} state="answered" />);
    expect(screen.getByText('Answered')).toBeDefined();
  });

  it('shows Markdown as plain text', () => {
    render(<QuestionCard questions={[{ text: 'Use **bold**?' }]} state="waiting" />);
    expect(screen.getByText('Use **bold**?')).toBeDefined();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<QuestionCard questions={questions} state="answered" />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
