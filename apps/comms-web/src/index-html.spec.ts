import {
  THEME_STORAGE_KEY,
  applyStoredThemeChoice,
  type ThemeChoice,
} from '@smotastic/pocket-design';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const app = join(import.meta.dirname, '..');
const html = readFileSync(join(app, 'index.html'), 'utf8');

const VOID = '#070b14';
const DAYLIGHT = '#eef2f7';

describe('the page shell', () => {
  it('gives the bar the color of each theme', () => {
    const page = new DOMParser().parseFromString(html, 'text/html');
    expect(
      [...page.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((meta) => [
        meta.dataset['scheme'],
        meta.getAttribute('media'),
        meta.content,
      ]),
    ).toEqual([
      ['dark', '(prefers-color-scheme: dark)', VOID],
      ['light', '(prefers-color-scheme: light)', DAYLIGHT],
    ]);
  });
});

describe('the start-up script', () => {
  const head = /<head>([\s\S]*)<\/head>/.exec(html)?.[1] ?? '';
  const inline = /<script>([\s\S]*?)<\/script>/.exec(head)?.[1] ?? '';

  /** The root's theme and the bar colors after `apply` on a fresh copy of the page's head. */
  const outcome = (apply: () => void) => {
    document.head.innerHTML = head.replace(/<script[\s\S]*?<\/script>/g, '');
    document.documentElement.removeAttribute('data-theme');
    apply();
    return {
      theme: document.documentElement.dataset['theme'],
      bar: [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
        (meta) => meta.content,
      ),
    };
  };

  // Runs the page's own script, as the browser does before the first paint.
  const runScript = () => new Function(inline)() as void;

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('runs in the head, before the app', () => {
    expect(inline).toMatch(/polaris-theme/);
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('/src/main.tsx'));
  });

  it.each<ThemeChoice | 'sepia' | null>(['dark', 'light', 'system', 'sepia', null])(
    'applies a stored %s exactly as the kit does',
    (stored) => {
      if (stored !== null) localStorage.setItem(THEME_STORAGE_KEY, stored);
      expect(outcome(runScript)).toEqual(outcome(applyStoredThemeChoice));
    },
  );

  it('paints Daylight with its bar color when Light is stored, whatever the system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(outcome(runScript)).toEqual({ theme: 'light', bar: [DAYLIGHT, DAYLIGHT] });
  });

  it('leaves the page to the system setting when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(outcome(runScript)).toEqual({ theme: undefined, bar: [VOID, DAYLIGHT] });
  });
});
