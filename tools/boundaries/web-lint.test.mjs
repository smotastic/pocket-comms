// Proves the ESLint rules for web apps fire: a web app takes its look only from the UI kit, so an
// inline `style` prop fails, while the same code outside a web app is not this rule's concern.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ESLint } from 'eslint';

const root = join(import.meta.dirname, '..', '..');
const eslint = new ESLint({ cwd: root });

const ruleIds = async (code, file) => {
  const [result] = await eslint.lintText(code, { filePath: join(root, file) });
  return (result?.messages ?? []).map((message) => message.ruleId);
};

const inlineStyle = "export const Box = () => <div style={{ color: 'red' }} />;\n";

test('an inline style prop in a web app fails the lint', async () => {
  const ids = await ruleIds(
    inlineStyle,
    'blueprints/bookmarks/apps/web/src/boundary-violation.tsx',
  );
  assert.deepEqual(ids, ['no-restricted-syntax']);
});

test('an inline style prop outside a web app is not flagged by the web rule', async () => {
  const ids = await ruleIds(inlineStyle, 'packages/design/ui/src/boundary-violation.tsx');
  assert.deepEqual(ids, []);
});
