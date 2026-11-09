import { describe, expect, it } from 'vitest';
import { formatScreen, screenWidth } from './terminal-screen.js';

describe('formatScreen', () => {
  it('shows the status, what was sent, the answer and the keys', () => {
    const text = formatScreen({ status: 'Ready', sent: 'dark mode', answer: 'Nice idea.' }, 40);

    expect(text).toContain('Ready');
    expect(text).toContain('You: dark mode');
    expect(text).toContain('Pi: Nice idea.');
    expect(text).toContain('space: talk');
  });

  it('names the keys that decide a proposal', () => {
    const text = formatScreen(
      { status: 'Ready', proposal: { text: 'pocket-home: Dark mode', decidable: true } },
      60,
    );

    expect(text).toContain('Issue? pocket-home: Dark mode');
    expect(text).toContain('y: create · n: discard');
  });

  it('wraps long lines to the width', () => {
    const lines = formatScreen({ status: 'Ready', answer: 'word '.repeat(30) }, 30).split('\n');

    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(30);
  });
});

describe('screenWidth', () => {
  it('fits the terminal, up to 72 columns', () => {
    expect(screenWidth(50)).toBe(50);
    expect(screenWidth(200)).toBe(72);
  });

  it('uses 60 columns when the terminal says nothing useful, such as 0', () => {
    expect(screenWidth(undefined)).toBe(60);
    expect(screenWidth(0)).toBe(60);
  });
});
