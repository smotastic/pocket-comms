// Proves that the Docker preflight of the local dev command tells each failure apart, so that
// `pnpm dev` stops at once with a hint instead of waiting on compose.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkDocker } from './docker-check.mjs';

// A stand-in for `spawnSync`: the result `docker info` would give.
const docker = (result) => () => ({ status: null, error: undefined, ...result });

test('passes while the daemon answers', () => {
  assert.deepEqual(checkDocker({ run: docker({ status: 0 }) }), { ok: true });
});

test('fails with a hint when the docker CLI is missing', () => {
  const error = Object.assign(new Error('spawnSync docker ENOENT'), { code: 'ENOENT' });
  const result = checkDocker({ run: docker({ error }) });
  assert.equal(result.ok, false);
  assert.match(result.message, /Docker is not installed/);
  assert.match(result.message, /pnpm dev:memory/);
});

test('fails with a hint when the daemon does not answer', () => {
  const result = checkDocker({ run: docker({ status: 1 }) });
  assert.equal(result.ok, false);
  assert.match(result.message, /Docker is not running/);
  assert.match(result.message, /pnpm dev:memory/);
});

test('fails with a hint when the daemon does not answer in time', () => {
  const error = Object.assign(new Error('spawnSync docker ETIMEDOUT'), { code: 'ETIMEDOUT' });
  const result = checkDocker({ run: docker({ error }) });
  assert.equal(result.ok, false);
  assert.match(result.message, /Docker is not running/);
});
