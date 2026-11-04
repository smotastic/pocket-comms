import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TerminalScreen } from './TerminalScreen.js';

afterEach(cleanup);

const ESC = '\u001b';

/** The screen's code block, once the Markdown renderer has loaded, which takes a while at first. */
const code = async () => {
  const region = screen.getByRole('region', { name: 'Screen of kirk' });
  await waitFor(() => expect(region.querySelector('pre code')).not.toBeNull(), { timeout: 10_000 });
  return region.querySelector('pre code')?.textContent;
};

describe('TerminalScreen', () => {
  it('shows the text of the screen as code, without its escape sequences', async () => {
    render(
      <TerminalScreen
        label="Screen of kirk"
        text={`${ESC}[1;31mError${ESC}[0m in foo.ts\n<b>not markup</b>`}
      />,
    );

    expect(await code()).toBe('Error in foo.ts\n<b>not markup</b>\n');
  });

  it('keeps a fence in the text as text', async () => {
    render(<TerminalScreen label="Screen of kirk" text={'```\nls\n```'} />);

    expect(await code()).toBe('```\nls\n```\n');
  });
});
