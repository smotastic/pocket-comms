import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { TerminalScreen } from './TerminalScreen.js';
import styles from './TerminalScreen.module.css';

afterEach(cleanup);

const ESC = '\u001b';

const region = () => screen.getByRole('region', { name: 'Screen of kirk' });

describe('TerminalScreen', () => {
  it('is a focusable region named by its label, holding the text as preformatted lines', async () => {
    render(<TerminalScreen label="Screen of kirk" text={'one\r\ntwo'} />);
    expect(region().querySelector('pre')?.textContent).toBe('one\ntwo');
    await userEvent.tab();
    expect(document.activeElement).toBe(region());
  });

  it('colours the 16 terminal colours with the token classes', () => {
    render(<TerminalScreen label="Screen of kirk" text={`${ESC}[31mred${ESC}[0m ${ESC}[104mbg`} />);
    expect(styles.fg1).toMatch(/\w/);
    expect(screen.getByText('red').classList).toContain(styles.fg1);
    expect(screen.getByText('bg').classList).toContain(styles.bg12);
  });

  it('colours a computed colour inline', () => {
    render(<TerminalScreen label="Screen of kirk" text={`${ESC}[38;2;177;185;249mpath`} />);
    expect(screen.getByText('path').style.color).toBe('rgb(177, 185, 249)');
  });

  it('applies bold, dim, italic and underline', () => {
    render(<TerminalScreen label="Screen of kirk" text={`${ESC}[1;2;3;4mx`} />);
    const span = screen.getByText('x');
    for (const name of ['bold', 'dim', 'italic', 'underline'] as const) {
      expect(styles[name]).toMatch(/\w/);
      expect(span.classList).toContain(styles[name]);
    }
  });

  it('swaps the colours of inverse text', () => {
    render(<TerminalScreen label="Screen of kirk" text={`${ESC}[7ma${ESC}[0;7;32;40mb`} />);
    expect(screen.getByText('a').classList).toContain(styles.fgInverse);
    expect(screen.getByText('a').classList).toContain(styles.bgInverse);
    expect(screen.getByText('b').classList).toContain(styles.fg0);
    expect(screen.getByText('b').classList).toContain(styles.bg2);
  });

  it('shows markup as text', () => {
    render(<TerminalScreen label="Screen of kirk" text="<img src=x onerror=alert(1)>" />);
    expect(region().querySelector('img')).toBeNull();
    expect(region().textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <TerminalScreen label="Screen of kirk" text={`${ESC}[32m●${ESC}[0m done`} />,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
