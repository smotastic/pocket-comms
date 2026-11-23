import { describe, expect, it } from '@effect/vitest';
import * as Option from 'effect/Option';
import * as Result from 'effect/Result';
import {
  attachTo,
  MAX_ATTACHED_PULL_REQUESTS,
  MAX_SHOWN_FILE_LINES,
  parsePullRequestPath,
  parseRepositoryName,
  parseUnifiedDiff,
  pullRequestState,
  samePullRequest,
  type AttachedPullRequestRef,
  type PullRequestRef,
} from './pull-request.js';

const ref = (number: number, name = 'pocket-comms'): PullRequestRef => ({
  owner: 'smotastic',
  name,
  number,
});

describe('parsePullRequestPath', () => {
  it('reads the owner, the repository and the number of a pull request page', () => {
    expect(parsePullRequestPath('/smotastic/pocket-comms/pulls/99')).toEqual(Option.some(ref(99)));
  });

  it('reads the page of its files or commits and a trailing slash', () => {
    expect(parsePullRequestPath('/smotastic/pocket-comms/pulls/7/files')).toEqual(
      Option.some(ref(7)),
    );
    expect(parsePullRequestPath('/smotastic/pocket-comms/pulls/7/')).toEqual(Option.some(ref(7)));
  });

  it('reads a page below a sub path where Gitea is served', () => {
    expect(parsePullRequestPath('/gitea/smotastic/pocket-comms/pulls/3', '/gitea')).toEqual(
      Option.some(ref(3)),
    );
  });

  it('refuses an issue, a number that is not positive and a broken name', () => {
    expect(parsePullRequestPath('/smotastic/pocket-comms/issues/99')).toEqual(Option.none());
    expect(parsePullRequestPath('/smotastic/pocket-comms/pulls/0')).toEqual(Option.none());
    expect(parsePullRequestPath('/smotastic/pocket-comms/pulls/7x')).toEqual(Option.none());
    expect(parsePullRequestPath('/smotastic/pocket comms/pulls/7')).toEqual(Option.none());
    expect(parsePullRequestPath('/pocket-comms/pulls/7')).toEqual(Option.none());
  });
});

describe('parseRepositoryName', () => {
  it('reads owner/name', () => {
    expect(parseRepositoryName('smotastic/pocket-comms')).toEqual(
      Result.succeed({ owner: 'smotastic', name: 'pocket-comms' }),
    );
  });

  it('refuses anything else', () => {
    for (const bad of ['pocket-comms', 'a/b/c', '/b', 'a/', 'a b/c', '../x']) {
      expect(Result.isFailure(parseRepositoryName(bad))).toBe(true);
    }
  });
});

describe('attachTo', () => {
  const at = (number: number): AttachedPullRequestRef => ({ ...ref(number), attachedAt: number });

  it('appends a new pull request', () => {
    expect(attachTo([at(1)], ref(2), 2)).toEqual(Result.succeed([at(1), at(2)]));
  });

  it('keeps the list as it is for one that is attached already', () => {
    expect(attachTo([at(1), at(2)], ref(1), 9)).toEqual(Result.succeed([at(1), at(2)]));
  });

  it('refuses one more than the limit', () => {
    const full = Array.from({ length: MAX_ATTACHED_PULL_REQUESTS }, (_, index) => at(index + 1));
    expect(Result.isFailure(attachTo(full, ref(99), 0))).toBe(true);
    expect(attachTo(full, ref(1), 0)).toEqual(Result.succeed(full));
  });

  it('tells pull requests apart by repository and number', () => {
    expect(samePullRequest(ref(1), ref(1))).toBe(true);
    expect(samePullRequest(ref(1), ref(1, 'other'))).toBe(false);
  });
});

describe('pullRequestState', () => {
  it('is merged for a closed, merged pull request', () => {
    expect(pullRequestState('open', false)).toBe('open');
    expect(pullRequestState('closed', true)).toBe('merged');
    expect(pullRequestState('closed', false)).toBe('closed');
  });
});

const DIFF = `diff --git a/src/added.ts b/src/added.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/added.ts
@@ -0,0 +1,2 @@
+export const a = 1;
+export const b = 2;
diff --git a/src/gone.ts b/src/gone.ts
deleted file mode 100644
index 2222222..0000000
--- a/src/gone.ts
+++ /dev/null
@@ -1 +0,0 @@
-export const gone = true;
diff --git a/src/changed.ts b/src/changed.ts
index 3333333..4444444 100644
--- a/src/changed.ts
+++ b/src/changed.ts
@@ -1,4 +1,4 @@ export const top
 one
-two
+TWO
 three
 four
@@ -20,2 +20,3 @@ function later
 twenty
+twenty-and-a-half
 twenty-one
\\ No newline at end of file
diff --git a/old/name.ts b/new/name.ts
similarity index 100%
rename from old/name.ts
rename to new/name.ts
diff --git a/old/edited.ts b/new/edited.ts
similarity index 80%
rename from old/edited.ts
rename to new/edited.ts
index 5555555..6666666 100644
--- a/old/edited.ts
+++ b/new/edited.ts
@@ -1 +1 @@
-x
+y
diff --git a/logo.png b/logo.png
new file mode 100644
index 0000000..7777777
Binary files /dev/null and b/logo.png differ
diff --git a/icon.png b/icon.png
index 8888888..9999999 100644
GIT binary patch
literal 10
Rcmd;JNMT@MQ2+n{
`;

describe('parseUnifiedDiff', () => {
  const files = parseUnifiedDiff(DIFF);

  it('reads every file in order, with its kind', () => {
    expect(files.map((file) => [file.path, file.kind])).toEqual([
      ['src/added.ts', 'added'],
      ['src/gone.ts', 'deleted'],
      ['src/changed.ts', 'modified'],
      ['new/name.ts', 'renamed'],
      ['new/edited.ts', 'renamed'],
      ['logo.png', 'added'],
      ['icon.png', 'modified'],
    ]);
  });

  it('keeps the path a renamed file had', () => {
    expect(files[3]?.previousPath).toBe('old/name.ts');
    expect(files[3]?.shown).toEqual({ kind: 'hunks', hunks: [] });
    expect(files[0]?.previousPath).toBeUndefined();
  });

  it('counts the added and removed lines', () => {
    expect(files.map((file) => [file.additions, file.deletions])).toEqual([
      [2, 0],
      [0, 1],
      [2, 1],
      [0, 0],
      [1, 1],
      [0, 0],
      [0, 0],
    ]);
  });

  it('numbers the lines of each hunk in the old and the new file', () => {
    const changed = files[2]?.shown;
    expect(changed?.kind).toBe('hunks');
    if (changed?.kind !== 'hunks') return;
    expect(changed.hunks.map((hunk) => hunk.header)).toEqual([
      '@@ -1,4 +1,4 @@ export const top',
      '@@ -20,2 +20,3 @@ function later',
    ]);
    expect(changed.hunks[0]?.lines).toEqual([
      { kind: 'context', text: 'one', old: 1, new: 1 },
      { kind: 'removed', text: 'two', old: 2 },
      { kind: 'added', text: 'TWO', new: 2 },
      { kind: 'context', text: 'three', old: 3, new: 3 },
      { kind: 'context', text: 'four', old: 4, new: 4 },
    ]);
    expect(changed.hunks[1]?.lines).toEqual([
      { kind: 'context', text: 'twenty', old: 20, new: 20 },
      { kind: 'added', text: 'twenty-and-a-half', new: 21 },
      { kind: 'context', text: 'twenty-one', old: 21, new: 22 },
    ]);
  });

  it('marks binary files, in both of git forms, and shows no lines of them', () => {
    expect(files[5]?.shown).toEqual({ kind: 'binary' });
    expect(files[6]?.shown).toEqual({ kind: 'binary' });
  });

  it('folds a file with more changed lines than the limit, and keeps its counts', () => {
    const lines = Array.from({ length: MAX_SHOWN_FILE_LINES + 1 }, (_, index) => `+line ${index}`);
    const big = `diff --git a/big.txt b/big.txt
new file mode 100644
--- /dev/null
+++ b/big.txt
@@ -0,0 +1,${lines.length} @@
${lines.join('\n')}
`;
    const [file] = parseUnifiedDiff(big);
    expect(file?.shown).toEqual({ kind: 'too-large' });
    expect(file?.additions).toBe(MAX_SHOWN_FILE_LINES + 1);
  });

  it('shows a file exactly at the limit', () => {
    const lines = Array.from({ length: MAX_SHOWN_FILE_LINES }, (_, index) => `+line ${index}`);
    const [file] = parseUnifiedDiff(`diff --git a/f b/f
--- a/f
+++ b/f
@@ -1,0 +1,${lines.length} @@
${lines.join('\n')}
`);
    expect(file?.shown.kind).toBe('hunks');
  });

  it('reads a path with spaces and answers nothing for text that is not a diff', () => {
    const [file] = parseUnifiedDiff(`diff --git a/my file.md b/my file.md
--- a/my file.md
+++ b/my file.md
@@ -1 +1 @@
-a
+b
`);
    expect(file?.path).toBe('my file.md');
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff('hello\nworld')).toEqual([]);
  });

  it('reads a CRLF diff', () => {
    const [file] = parseUnifiedDiff(
      'diff --git a/w.txt b/w.txt\r\n--- a/w.txt\r\n+++ b/w.txt\r\n@@ -1 +1 @@\r\n-a\r\n+b\r\n',
    );
    expect(file?.shown).toEqual({
      kind: 'hunks',
      hunks: [
        {
          header: '@@ -1 +1 @@',
          lines: [
            { kind: 'removed', text: 'a', old: 1 },
            { kind: 'added', text: 'b', new: 1 },
          ],
        },
      ],
    });
  });
});
