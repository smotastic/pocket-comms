import { describe, expect, it } from '@effect/vitest';
import * as Result from 'effect/Result';
import {
  baseChanged,
  brainstormImages,
  cutDoc,
  cutIssueBody,
  isProjectDoc,
  MAX_DOC_LENGTH,
  MAX_ISSUE_BODY,
  MAX_ISSUE_TITLE,
  MAX_PROPOSAL_IMAGES,
  missingImages,
  parseProposedIssue,
  parseIssueEdit,
  parseImageChoice,
  imagesByNumber,
  proposalOf,
  readOf,
  rememberRead,
  withImages,
  type BrainstormEntry,
  type IssueProposal,
  type IssueRead,
} from './brainstorm.js';

const proposal = (id: string, state: IssueProposal['state'] = { _tag: 'open' }): IssueProposal => ({
  type: 'proposal',
  kind: 'issue',
  id,
  at: 2,
  project: 'pocket-home',
  title: 'Dark mode',
  body: 'A toggle.',
  images: [],
  attached: [],
  state,
});

const recorded = (one: IssueProposal): BrainstormEntry => ({ kind: 'proposal', proposal: one });

const entries: ReadonlyArray<BrainstormEntry> = [
  { kind: 'said', id: 'u1', at: 1, text: 'Idea: dark mode', images: [] },
  recorded(proposal('p1')),
  recorded(proposal('p2', { _tag: 'discarded' })),
];

describe('parseProposedIssue', () => {
  it('trims the fields', () => {
    expect(
      parseProposedIssue({ project: ' pocket-home ', title: '  Dark mode ', body: '\nBody\n' }),
    ).toEqual(Result.succeed({ project: 'pocket-home', title: 'Dark mode', body: 'Body' }));
  });

  it('refuses a blank title, a title over the limit and a body over the limit', () => {
    const issues = (issue: { project: string; title: string; body: string }) => {
      const result = parseProposedIssue(issue);
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
        parseProposedIssue({ project: 'a', title: 'x'.repeat(MAX_ISSUE_TITLE), body: '' }),
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

  it('finds the latest record of a proposal', () => {
    const decided: IssueProposal = {
      ...proposal('p1'),
      state: { _tag: 'created', number: 12, url: 'http://gitea/i/12' },
    };
    expect(proposalOf([...entries, recorded(decided)], 'p1')).toBe(decided);
  });
});

describe('parseIssueEdit', () => {
  it('trims the title and keeps the body as written', () => {
    expect(parseIssueEdit({ title: '  Orchestrator ', body: '## Idea\n\nText\n' })).toEqual(
      Result.succeed({ title: 'Orchestrator', body: '## Idea\n\nText\n' }),
    );
  });

  it('refuses a blank title and fields over the limits', () => {
    const fields = (edit: { title: string; body: string }) => {
      const result = parseIssueEdit(edit);
      return Result.isFailure(result) ? result.failure.issues.map((issue) => issue.field) : [];
    };
    expect(fields({ title: ' ', body: '' })).toEqual(['title']);
    expect(fields({ title: 'x'.repeat(MAX_ISSUE_TITLE + 1), body: '' })).toEqual(['title']);
    expect(fields({ title: 'x', body: 'x'.repeat(MAX_ISSUE_BODY + 1) })).toEqual(['body']);
  });
});

describe('issue reads', () => {
  const read = (number: number, title: string, project = 'pocket-comms'): IssueRead => ({
    project,
    number,
    url: `http://gitea/${project}/issues/${number}`,
    title,
    body: 'Body',
    cut: false,
  });

  it('keeps the last read of each issue', () => {
    const reads = rememberRead(
      rememberRead(rememberRead([], read(11, 'Old')), read(12, 'Other')),
      read(11, 'New'),
    );
    expect(reads).toHaveLength(2);
    expect(readOf(reads, 'pocket-comms', 11)?.title).toBe('New');
    expect(readOf(reads, 'pocket-comms', 12)?.title).toBe('Other');
  });

  it('tells issues of different projects apart', () => {
    const reads = rememberRead([read(11, 'Comms')], read(11, 'Home', 'pocket-home'));
    expect(readOf(reads, 'pocket-comms', 11)?.title).toBe('Comms');
    expect(readOf(reads, 'pocket-home', 11)?.title).toBe('Home');
    expect(readOf(reads, 'pocket-home', 12)).toBeUndefined();
  });

  it('cuts a body over the limit and says it was cut', () => {
    expect(cutIssueBody('short')).toEqual({ body: 'short', cut: false });
    const long = cutIssueBody('x'.repeat(MAX_ISSUE_BODY + 1));
    expect(long.cut).toBe(true);
    expect(long.body).toHaveLength(MAX_ISSUE_BODY);
  });

  it('sees a change of the title or the body, and nothing else', () => {
    const base = { title: 'T', body: 'B' };
    expect(baseChanged(base, { title: 'T', body: 'B' })).toBe(false);
    expect(baseChanged(base, { title: 'T2', body: 'B' })).toBe(true);
    expect(baseChanged(base, { title: 'T', body: 'B2' })).toBe(true);
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

describe('images', () => {
  const imageA = 'a'.repeat(26);
  const imageB = 'b'.repeat(26);
  const imageC = 'c'.repeat(26);
  const history: ReadonlyArray<BrainstormEntry> = [
    { kind: 'said', id: 'u1', at: 1, text: 'Like this?', images: [imageA, imageB] },
    { kind: 'brainstormStarted' },
    { kind: 'said', id: 'u2', at: 3, text: '', images: [imageC] },
  ];

  it('numbers the images of the brainstorm from 1 in the order they were sent', () => {
    expect(brainstormImages(history)).toEqual([
      { id: imageA, number: 1 },
      { id: imageB, number: 2 },
      { id: imageC, number: 3 },
    ]);
    expect(brainstormImages(entries)).toEqual([]);
  });

  it('finds the images Pi names by number, in their order', () => {
    expect(imagesByNumber(history, [3, 1])).toEqual(Result.succeed([imageA, imageC]));
  });

  it('refuses a number that is no image of the history, a repeat, and more than five', () => {
    expect(Result.isFailure(imagesByNumber(history, [4]))).toBe(true);
    expect(Result.isFailure(imagesByNumber(history, [0]))).toBe(true);
    expect(Result.isFailure(imagesByNumber(history, [1, 1]))).toBe(true);
    expect(Result.isFailure(imagesByNumber(history, [1, 2, 3, 1, 2, 3]))).toBe(true);
  });

  it('checks the owner choice by id and puts it in number order', () => {
    expect(parseImageChoice(history, [imageC, imageB])).toEqual(Result.succeed([imageB, imageC]));
    expect(parseImageChoice(history, [])).toEqual(Result.succeed([]));
    expect(Result.isFailure(parseImageChoice(history, ['z'.repeat(26)]))).toBe(true);
    expect(Result.isFailure(parseImageChoice(history, [imageA, imageA]))).toBe(true);
  });

  it('refuses more than five chosen images', () => {
    const many: ReadonlyArray<BrainstormEntry> = [
      {
        kind: 'said',
        id: 'u1',
        at: 1,
        text: '',
        images: ['a', 'b', 'c', 'd', 'e', 'f'].map((letter) => letter.repeat(26)),
      },
    ];
    const ids = brainstormImages(many).map((image) => image.id);
    expect(Result.isFailure(parseImageChoice(many, ids))).toBe(true);
    expect(MAX_PROPOSAL_IMAGES).toBe(5);
  });

  it('appends a Images block to the body, and keeps the body without images', () => {
    expect(withImages('The idea.', [])).toBe('The idea.');
    expect(
      withImages('The idea.', [
        { number: 1, url: 'https://gitea.test/attachments/1' },
        { number: 3, url: 'https://gitea.test/attachments/3' },
      ]),
    ).toBe(
      'The idea.\n\n## Images\n\n![Image 1](https://gitea.test/attachments/1)\n![Image 3](https://gitea.test/attachments/3)',
    );
    expect(withImages('', [{ number: 2, url: 'u' }])).toBe('## Images\n\n![Image 2](u)');
  });

  it('names the chosen images that are not attached yet', () => {
    expect(missingImages([imageA, imageB], [{ image: imageA, url: 'u' }])).toEqual([imageB]);
  });
});
