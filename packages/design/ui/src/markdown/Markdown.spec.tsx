import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { Markdown } from './Markdown.js';

afterEach(cleanup);

describe('Markdown', () => {
  it('renders headings, emphasis, lists and tables', { timeout: 15_000 }, async () => {
    render(
      <Markdown
        text={[
          '## Plan',
          '',
          'We start with **the parser**.',
          '',
          '- lexer',
          '  - tokens',
          '',
          '| Step | Output |',
          '| --- | --- |',
          '| lex | tokens |',
        ].join('\n')}
      />,
    );
    // The first test loads the renderer, which can take seconds on a busy CI machine.
    expect(await screen.findByRole('heading', { name: 'Plan' }, { timeout: 10_000 })).toBeDefined();
    expect(screen.getByText('the parser', { selector: 'strong' })).toBeDefined();
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getByRole('table')).toBeDefined();
    expect(screen.getByRole('cell', { name: 'tokens' })).toBeDefined();
  });

  it('shows the text as written until the renderer has loaded', async () => {
    // A fresh module: the renderer is cached once any earlier test has loaded it.
    vi.resetModules();
    const { Markdown: Fresh } = await import('./Markdown.js');
    const { container } = render(<Fresh text="We start with **the parser**." />);
    expect(container.textContent).toBe('We start with **the parser**.');
    expect(await screen.findByText('the parser', { selector: 'strong' })).toBeDefined();
  });

  it('shows the text as written when the renderer fails to load', async () => {
    vi.resetModules();
    vi.doMock('./MarkdownContent.js', () => {
      throw new Error('offline');
    });
    const { Markdown: Fresh } = await import('./Markdown.js');
    const { container } = render(<Fresh text="We start with **the parser**." />);
    await act(() => import('./MarkdownContent.js').catch(() => undefined));
    expect(container.textContent).toBe('We start with **the parser**.');
    vi.doUnmock('./MarkdownContent.js');
  });

  it('never renders raw HTML: it shows it as text', async () => {
    const { container } = render(
      <Markdown text={'<img src=x onerror="alert(1)"> <b>bold</b>\n\n**loaded**'} />,
    );
    await screen.findByText('loaded', { selector: 'strong' });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<img');
  });

  it('drops javascript: links and images', async () => {
    const { container } = render(
      <Markdown text={'[click](javascript:alert(1)) ![pixel](https://example.org/p.png)'} />,
    );
    await screen.findByText('click');
    expect(container.querySelector('a')?.getAttribute('href') ?? '').not.toContain('javascript');
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps plain text exactly as written', async () => {
    render(<Markdown text={'Keep README and ReadMe apart?\n\n**loaded**'} />);
    await screen.findByText('loaded', { selector: 'strong' });
    expect(screen.getByText('Keep README and ReadMe apart?', { selector: 'p' })).toBeDefined();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Markdown text={'# Title\n\nText with a [link](https://example.org).'} />,
    );
    await screen.findByRole('link', { name: 'link' });
    expect(await axeViolations(container)).toEqual([]);
  });
});
