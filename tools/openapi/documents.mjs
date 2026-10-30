// The OpenAPI documents, one per server app, as repository-relative paths: the committed ones and
// the new ones not yet added, so a new app's document is checked before its first commit.
import { execFileSync } from 'node:child_process';

export const documents = () =>
  execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', ':(glob)**/api/openapi.json'],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);
