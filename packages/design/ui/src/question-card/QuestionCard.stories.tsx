import type { Story } from '@ladle/react';
import { Stack } from '../layout/Stack.js';
import { QuestionCard } from './QuestionCard.js';

const stack = {
  header: 'Stack',
  text: 'Keep Effect + PostgreSQL + hexagonal layers as the default?',
};
const projects = {
  header: 'Projects',
  text: 'What kinds of projects do you spin up from this template?',
};
const questions = [stack, projects];

export const States: Story = () => (
  <Stack gap="md">
    <QuestionCard
      questions={[
        { ...stack, answer: 'Keep Effect, simplify' },
        { ...projects, answer: 'Backend APIs/services, Web frontends' },
      ]}
      state="answered"
    />
    <QuestionCard questions={questions} state="waiting" />
    <QuestionCard questions={questions} state="unanswered" />
  </Stack>
);
