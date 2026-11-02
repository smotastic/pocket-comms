import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tokens as fromTokens } from '@pocket-comms/design-tokens';
import { describe, expect, it } from 'vitest';
import { tokens } from './index.js';
import { FOOTER_HEIGHT_VARIABLE } from './layout/docking.js';

const tokensCss = readFileSync(
  createRequire(import.meta.url).resolve('@pocket-comms/design-tokens/tokens.css'),
  'utf8',
);
const defined = new Set([...tokensCss.matchAll(/^\s*(--[\w-]+):/gm)].map((match) => match[1]));
// Variables the kit's own scripts publish on the page, such as a docked footer's height.
const published = new Set([FOOTER_HEIGHT_VARIABLE]);

const cssFiles = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? cssFiles(join(dir, entry.name))
      : entry.name.endsWith('.css')
        ? [join(dir, entry.name)]
        : [],
  );

const baseCss = readFileSync(join(import.meta.dirname, 'base.css'), 'utf8');

describe('the UI kit and the design tokens', () => {
  it('re-exports the token constants', () => {
    expect(tokens).toBe(fromTokens);
  });

  it('uses only token variables that the tokens define, and the ones the kit publishes', () => {
    const files = cssFiles(import.meta.dirname);
    expect(files.length).toBeGreaterThan(0);
    const undefinedUses = files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/var\((--[\w-]+)/g)]
        .map((match) => match[1] ?? '')
        .filter((name) => !defined.has(name) && !published.has(name))
        .map((name) => `${file}: ${name}`),
    );
    expect(undefinedUses).toEqual([]);
  });

  it('lets native controls follow the system theme and a forced data-theme', () => {
    expect(baseCss).toMatch(/:root \{[^}]*color-scheme: light dark;/);
    expect(baseCss).toMatch(/:root\[data-theme='light'\] \{\s*color-scheme: light;/);
    expect(baseCss).toMatch(/:root\[data-theme='dark'\] \{\s*color-scheme: dark;/);
  });
});
