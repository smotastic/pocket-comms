// Proves that the stale-output comparison names every generated file that differs from a fresh
// build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staleFiles } from './stale.mjs';

const withDirs = async (fresh, committed, check) => {
  const dirs = await Promise.all([fresh, committed].map(() => mkdtemp(join(tmpdir(), 'stale-'))));
  try {
    for (const [dir, files] of [
      [dirs[0], fresh],
      [dirs[1], committed],
    ]) {
      for (const [name, content] of Object.entries(files))
        await writeFile(join(dir, name), content);
    }
    await check(await staleFiles({ freshDir: dirs[0], committedDir: dirs[1] }));
  } finally {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  }
};

test('identical output is current', () =>
  withDirs({ 'a.css': 'a' }, { 'a.css': 'a' }, (stale) => assert.deepEqual(stale, [])));

test('a changed file is stale', () =>
  withDirs({ 'a.css': 'new' }, { 'a.css': 'old' }, (stale) =>
    assert.deepEqual(stale, ['a.css: differs from a fresh build']),
  ));

test('a file the build writes but the repository lacks is stale', () =>
  withDirs({ 'a.css': 'a', 'b.ts': 'b' }, { 'a.css': 'a' }, (stale) =>
    assert.deepEqual(stale, ['b.ts: missing']),
  ));

test('a committed file the build no longer writes is stale', () =>
  withDirs({ 'a.css': 'a' }, { 'a.css': 'a', 'old.ts': 'x' }, (stale) =>
    assert.deepEqual(stale, ['old.ts: no longer generated']),
  ));

test('a missing committed folder makes every generated file missing', async () => {
  const freshDir = await mkdtemp(join(tmpdir(), 'stale-'));
  try {
    await writeFile(join(freshDir, 'a.css'), 'a');
    const committedDir = join(freshDir, 'does-not-exist');
    assert.deepEqual(await staleFiles({ freshDir, committedDir }), ['a.css: missing']);
  } finally {
    await rm(freshDir, { recursive: true, force: true });
  }
});
