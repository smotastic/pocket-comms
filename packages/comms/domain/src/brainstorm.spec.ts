import { describe, expect, it } from '@effect/vitest';
import * as Result from 'effect/Result';
import {
  cutDoc,
  isProjectDoc,
  MAX_DOC_LENGTH,
  MAX_ISSUE_BODY,
  MAX_ISSUE_TITLE,
  parseIssueDraft,
  proposalOf,
  settleProposal,
  type BrainstormEntry,
  type ProposalEntry,
} from './brainstorm.js';

const proposal = (id: string, state: ProposalEntry['state'] = { _tag: 'open' }): ProposalEntry => ({
  type: 'proposal',
  id,
  at: 2,
  project: 'pocket-home',
  title: 'Dark mode',
  body: 'A toggle.',
  state,
});

const entries: ReadonlyArray<BrainstormEntry> = [
  { type: 'user', id: 'u1', at: 1, text: 'Idea: dark mode' },
  proposal('p1'),
  proposal('p2', { _tag: 'discarded' }),
];

describe('parseIssueDraft', () => {
  it('trims the fields', () => {
    expect(
      parseIssueDraft({ project: ' pocket-home ', title: '  Dark mode ', body: '\nBody\n' }),
    ).toEqual(Result.succeed({ project: 'pocket-home', title: 'Dark mode', body: 'Body' }));
  });

  it('refuses a blank title, a title over the limit and a body over the limit', () => {
    const issues = (draft: { project: string; title: string; body: string }) => {
      const result = parseIssueDraft(draft);
      return Result.isFailure(result) ? result.failure.issues.map((issue) => issue.field) : [];
    };
    expect(issues({ project: 'a', title: ' ', body: '' })).toEqual(['title']);
    expect(issues({ project: 'a', title: 'x'.repeat(MAX_ISSUE_TITLE + 1), body: '' })).toEqual([
      'title',
    ]);
    expect(issues({ project: 'a', title: 'x', body: 'x'.repeat(MAX_ISSUE_BODY + 1) })).toEqual([
      'body',
    ]);
    expect(issues({ project: '', title: '', body: '' })).toEqual(['project', 'title']);
  });

  it('accepts a title of exactly the limit and an empty body', () => {
    expect(
      Result.isSuccess(
        parseIssueDraft({ project: 'a', title: 'x'.repeat(MAX_ISSUE_TITLE), body: '' }),
      ),
    ).toBe(true);
  });
});

describe('proposals', () => {
  it('finds a proposal by its id, and nothing for another entry or an unknown id', () => {
    expect(proposalOf(entries, 'p1')?.id).toBe('p1');
    expect(proposalOf(entries, 'u1')).toBeUndefined();
    expect(proposalOf(entries, 'nope')).toBeUndefined();
  });

  it('settles a proposal with the decided draft and leaves every other entry', () => {
    const settled = settleProposal(
      entries,
      'p1',
      { project: 'pocket-comms', title: 'Dark mode toggle', body: 'B' },
      { _tag: 'created', number: 12, url: 'http://gitea/i/12' },
    );
    expect(settled[1]).toEqual({
      ...proposal('p1'),
      project: 'pocket-comms',
      title: 'Dark mode toggle',
      body: 'B',
      state: { _tag: 'created', number: 12, url: 'http://gitea/i/12' },
    });
    expect(settled[0]).toBe(entries[0]);
    expect(settled[2]).toBe(entries[2]);
  });
});

describe('project docs', () => {
  it('allows only the top-level README.md and AGENTS.md', () => {
    expect(['README.md', 'AGENTS.md'].map(isProjectDoc)).toEqual([true, true]);
    expect(['../secrets', 'src/main.ts', 'readme.md', 'docs/README.md'].map(isProjectDoc)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('cuts a long doc and says so', () => {
    expect(cutDoc('short')).toBe('short');
    const cut = cutDoc('x'.repeat(MAX_DOC_LENGTH + 10));
    expect(cut.startsWith('x'.repeat(MAX_DOC_LENGTH))).toBe(true);
    expect(cut.endsWith('[cut: the file is longer]')).toBe(true);
  });
});
