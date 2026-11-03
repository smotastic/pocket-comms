// Proves what the token build writes: the CSS custom properties per theme and the typed
// `var(--…)` constants of the semantic tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTokens } from '../style-dictionary.mjs';

const built = async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'design-tokens-'));
  try {
    await buildTokens({ outDir });
    return {
      css: await readFile(join(outDir, 'tokens.css'), 'utf8'),
      ts: await readFile(join(outDir, 'tokens.ts'), 'utf8'),
    };
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
};

/** The declarations of the first block that opens with `selector`. */
const block = (css, selector) => {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `no block for ${selector}`);
  return css.slice(start, css.indexOf('}', start));
};

test('the light theme and the theme-independent tokens are on :root', async () => {
  const { css } = await built();
  const root = block(css, ':root');
  assert.match(root, /--color-bg-surface: #ffffff;/);
  assert.match(root, /--space-md: 12px;/);
  assert.match(root, /--font-size-md: 0\.875rem;/);
  assert.match(root, /--motion-duration-fast: 150ms;/);
});

test('the dark theme applies from the system setting unless light is forced', async () => {
  const { css } = await built();
  assert.match(
    css,
    /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\) \{/,
  );
  assert.match(block(css, ":root:not([data-theme='light'])"), /--color-bg-surface: #171a21;/);
});

test('data-theme="dark" forces the dark theme', async () => {
  const { css } = await built();
  const dark = block(css, ":root[data-theme='dark']");
  assert.match(dark, /--color-bg-surface: #171a21;/);
  assert.doesNotMatch(dark, /--space-md/);
});

test('primitives are not emitted, so components cannot use them', async () => {
  const { css } = await built();
  assert.doesNotMatch(css, /--color-indigo-|--size-|--font-size-14/);
});

test('the TS constants name the variables of the semantic tokens', async () => {
  const { ts } = await built();
  assert.match(ts, /export const tokens = \{/);
  assert.match(ts, /surface: 'var\(--color-bg-surface\)'/);
  assert.match(ts, /'3xs': 'var\(--space-3xs\)'/);
  assert.match(ts, /\} as const;/);
});
