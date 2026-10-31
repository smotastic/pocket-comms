import { describe, expect, it } from 'vitest';
import { suggestBranch } from './branch.js';

describe('suggestBranch', () => {
  it.each([
    ['Fix the login redirect', 'fix/the-login-redirect'],
    ['Bug: menu flickers on iOS', 'fix/menu-flickers-on-ios'],
    ['Add a dark mode toggle\nIn the settings.', 'feat/add-a-dark-mode-toggle'],
    ['  Übersicht für Café-Gäste  ', 'feat/ubersicht-fur-cafe-gaste'],
    ['Fixture loader for tests', 'feat/fixture-loader-for-tests'],
    [
      'Rewrite the whole transcript parser so it follows appended lines only',
      'feat/rewrite-the-whole-transcript-parser-so',
    ],
    ['x'.repeat(50), `feat/${'x'.repeat(40)}`],
    ['', 'feat/'],
  ])('suggests a branch for %j', (task, branch) => {
    expect(suggestBranch(task)).toBe(branch);
  });
});
