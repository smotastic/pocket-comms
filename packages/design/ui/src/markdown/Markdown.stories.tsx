import type { Story } from '@ladle/react';
import { Markdown } from './Markdown.js';

export const ChatMessage: Story = () => (
  <Markdown
    text={[
      '## The plan',
      '',
      'We start from **one rule**: the parser never guesses.',
      '',
      '- `lex` — split the text',
      '  - `token` — one word',
      '',
      '| Step | Input | Output |',
      '| --- | --- | --- |',
      '| lex | text | tokens |',
    ].join('\n')}
  />
);
