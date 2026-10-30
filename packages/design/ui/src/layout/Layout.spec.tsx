import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { DockedPage } from './DockedPage.js';
import gaps from './gap.module.css';
import { Inline } from './Inline.js';
import styles from './Layout.module.css';
import { Page } from './Page.js';
import { Stack } from './Stack.js';

afterEach(cleanup);

// A section without a name is no landmark, so it must not compile.
// @ts-expect-error -- `aria-label` is required for a section.
const _unnamedSection = () => <Stack as="section" gap="md" />;

describe('Page', () => {
  it('is the main landmark, centered and width-limited', () => {
    render(<Page>Content</Page>);
    const main = screen.getByRole('main');
    expect(styles.page).toMatch(/\w/);
    expect(main.classList).toContain(styles.page);
  });
});

describe('DockedPage', () => {
  // jsdom lays nothing out: give the body a size and a scroll position by hand.
  const sized = (element: HTMLElement, scrollHeight: number, clientHeight: number) => {
    Object.defineProperty(element, 'scrollHeight', { configurable: true, value: scrollHeight });
    Object.defineProperty(element, 'clientHeight', { configurable: true, value: clientHeight });
  };
  const page = (lines: ReadonlyArray<string>) => (
    <DockedPage header={<p>Head</p>} footer={<button type="button">Send</button>} label="Talk">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </DockedPage>
  );

  it('is the main landmark with a fixed header and footer and a scrolling, focusable body', () => {
    render(page(['one']));
    const main = screen.getByRole('main');
    const body = screen.getByRole('region', { name: 'Talk' });
    expect(styles.docked).toMatch(/\w/);
    expect(main.classList).toContain(styles.docked);
    expect(body.classList).toContain(styles.dockedBody);
    expect(body.tabIndex).toBe(0);
    expect(main.firstElementChild?.textContent).toBe('Head');
    expect(main.lastElementChild?.textContent).toBe('Send');
  });

  it('follows what is added while the reader is at the end', async () => {
    const { rerender } = render(page(['one']));
    const body = screen.getByRole('region', { name: 'Talk' });
    sized(body, 900, 300);
    rerender(page(['one', 'two']));
    await act(async () => undefined);
    expect(body.scrollTop).toBe(900);
  });

  it('stays put once the reader scrolls up', async () => {
    const { rerender } = render(page(['one']));
    const body = screen.getByRole('region', { name: 'Talk' });
    sized(body, 900, 300);
    body.scrollTop = 100;
    fireEvent.scroll(body);
    rerender(page(['one', 'two']));
    await act(async () => undefined);
    expect(body.scrollTop).toBe(100);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(page(['one']));
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Stack', () => {
  it('stacks its children with a token gap', () => {
    render(<Stack gap="lg">Content</Stack>);
    const stack = screen.getByText('Content');
    expect(gaps['gap-lg']).toMatch(/\w/);
    expect(stack.classList).toContain(styles.stack);
    expect(stack.classList).toContain(gaps['gap-lg']);
  });

  it('can be a header or a section', () => {
    render(
      <>
        <Stack as="header" gap="2xs">
          Head
        </Stack>
        <Stack as="section" gap="md" aria-label="List">
          Body
        </Stack>
      </>,
    );
    expect(screen.getByRole('banner').textContent).toBe('Head');
    expect(screen.getByRole('region', { name: 'List' }).textContent).toBe('Body');
  });
});

describe('Inline', () => {
  it('lines up its children with a token gap and wraps them', () => {
    render(<Inline gap="xs">Content</Inline>);
    const inline = screen.getByText('Content');
    expect(inline.classList).toContain(styles.inline);
    expect(inline.classList).toContain(gaps['gap-xs']);
    expect(inline.classList).not.toContain(styles.nowrap);
  });

  it('can keep its children on one line and push them apart or to the end', () => {
    render(
      <>
        <Inline gap="sm" wrap={false} justify="between">
          Apart
        </Inline>
        <Inline gap="sm" justify="end">
          End
        </Inline>
      </>,
    );
    for (const name of [styles.nowrap, styles.between, styles.end]) expect(name).toMatch(/\w/);
    expect(screen.getByText('Apart').classList).toContain(styles.nowrap);
    expect(screen.getByText('Apart').classList).toContain(styles.between);
    expect(screen.getByText('End').classList).toContain(styles.end);
  });
});

describe('layout', () => {
  it('has a distinct gap class for every space token', () => {
    const names = ['3xs', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'].map(
      (gap) => gaps[`gap-${gap}`],
    );
    expect(names.every((name) => typeof name === 'string' && name.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Page>
        <Stack as="header" gap="2xs">
          Head
        </Stack>
        <Inline gap="xs">Content</Inline>
      </Page>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
