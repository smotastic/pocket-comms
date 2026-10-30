import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';

const configFile = join(import.meta.dirname, '../../../../stylelint.config.mjs');

const problems = async (code: string) => {
  const { results } = await stylelint.lint({ code, configFile });
  return (results[0]?.warnings ?? []).map((warning) => warning.text);
};

describe('the UI kit stylesheet rules', () => {
  it('reject a hex color', async () => {
    expect(await problems('.a { color: #4f46e5; }')).toContainEqual(
      expect.stringContaining('"#4f46e5" of "color"'),
    );
  });

  it('reject a color function', async () => {
    expect(await problems('.a { background: rgb(0 0 0 / 8%); }')).toContainEqual(
      expect.stringContaining('"rgb(0 0 0 / 8%)" of "background'),
    );
  });

  it('reject a pixel size, also inside a shorthand', async () => {
    expect(await problems('.a { padding: var(--space-sm) 16px; }')).toContainEqual(
      expect.stringContaining('"16px" of "padding'),
    );
  });

  it('reject a raw duration, radius, shadow and font size', async () => {
    const code =
      '.a { transition-duration: 150ms; border-radius: 8px; box-shadow: 0 1px 2px black; ' +
      'font-size: 0.875rem; }';
    const properties = (await problems(code)).map((text) => /of "([\w-]+)"/.exec(text)?.[1]);
    expect(new Set(properties)).toEqual(
      new Set(['transition-duration', 'border-radius', 'box-shadow', 'font-size']),
    );
  });

  it('accept token variables and neutral keywords', async () => {
    const code =
      '.a { color: var(--color-text-default); padding: var(--space-sm) var(--space-lg); ' +
      'border: var(--border-width-default) solid var(--color-border-default); margin: 0; ' +
      'background: transparent; box-shadow: none; width: 100%; font-style: italic; ' +
      'border-collapse: collapse; }';
    expect(await problems(code)).toEqual([]);
  });

  it('accept the safe-area insets of the device but no other environment value', async () => {
    expect(await problems('.a { padding-top: env(safe-area-inset-top); }')).toEqual([]);
    expect(await problems('.a { height: env(keyboard-inset-height); }')).toContainEqual(
      expect.stringContaining('"env(keyboard-inset-height)" of "height"'),
    );
  });

  it('accept the base stylesheet', async () => {
    expect(await problems(readFileSync(join(import.meta.dirname, 'base.css'), 'utf8'))).toEqual([]);
  });
});
