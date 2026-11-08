import { describe, expect, it } from '@effect/vitest';
import * as Result from 'effect/Result';
import {
  baseChanged,
  chatPictures,
  cutDoc,
  cutIssueBody,
  isProjectDoc,
  MAX_DOC_LENGTH,
  MAX_ISSUE_BODY,
  MAX_ISSUE_TITLE,
  MAX_PROPOSAL_PICTURES,
  missingPictures,
  parseIssueDraft,
  parseIssueEdit,
  parsePictureChoice,
  picturesByNumber,
  proposalOf,
  readOf,
  rememberRead,
  withPictures,
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
  pictures: [],
  attached: [],
  state,
});

const recorded = (one: IssueProposal): BrainstormEntry => ({ kind: 'proposal', proposal: one });

const entries: ReadonlyArray<BrainstormEntry> = [
  { kind: 'said', id: 'u1', at: 1, text: 'Idea: dark mode', images: [] },
  recorded(proposal('p1')),
  recorded(proposal('p2', { _tag: 'discarded' })),
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

describe('pictures', () => {
  const imageA = 'a'.repeat(26);
  const imageB = 'b'.repeat(26);
  const imageC = 'c'.repeat(26);
  const chat: ReadonlyArray<BrainstormEntry> = [
    { kind: 'said', id: 'u1', at: 1, text: 'Like this?', images: [imageA, imageB] },
    { kind: 'chatStarted' },
    { kind: 'said', id: 'u2', at: 3, text: '', images: [imageC] },
  ];

  it('numbers the pictures of the chat from 1 in the order they were sent', () => {
    expect(chatPictures(chat)).toEqual([
      { id: imageA, number: 1 },
      { id: imageB, number: 2 },
      { id: imageC, number: 3 },
    ]);
    expect(chatPictures(entries)).toEqual([]);
  });

  it('finds the pictures Pi names by number, in their order', () => {
    expect(picturesByNumber(chat, [3, 1])).toEqual(Result.succeed([imageA, imageC]));
  });

  it('refuses a number that is no picture of the chat, a repeat, and more than five', () => {
    expect(Result.isFailure(picturesByNumber(chat, [4]))).toBe(true);
    expect(Result.isFailure(picturesByNumber(chat, [0]))).toBe(true);
    expect(Result.isFailure(picturesByNumber(chat, [1, 1]))).toBe(true);
    expect(Result.isFailure(picturesByNumber(chat, [1, 2, 3, 1, 2, 3]))).toBe(true);
  });

  it('checks the owner choice by id and puts it in number order', () => {
    expect(parsePictureChoice(chat, [imageC, imageB])).toEqual(Result.succeed([imageB, imageC]));
    expect(parsePictureChoice(chat, [])).toEqual(Result.succeed([]));
    expect(Result.isFailure(parsePictureChoice(chat, ['z'.repeat(26)]))).toBe(true);
    expect(Result.isFailure(parsePictureChoice(chat, [imageA, imageA]))).toBe(true);
  });

  it('refuses more than five chosen pictures', () => {
    const many: ReadonlyArray<BrainstormEntry> = [
      {
        kind: 'said',
        id: 'u1',
        at: 1,
        text: '',
        images: ['a', 'b', 'c', 'd', 'e', 'f'].map((letter) => letter.repeat(26)),
      },
    ];
    const ids = chatPictures(many).map((picture) => picture.id);
    expect(Result.isFailure(parsePictureChoice(many, ids))).toBe(true);
    expect(MAX_PROPOSAL_PICTURES).toBe(5);
  });

  it('appends a Pictures block to the body, and keeps the body without pictures', () => {
    expect(withPictures('The idea.', [])).toBe('The idea.');
    expect(
      withPictures('The idea.', [
        { number: 1, url: 'https://gitea.test/attachments/1' },
        { number: 3, url: 'https://gitea.test/attachments/3' },
      ]),
    ).toBe(
      'The idea.\n\n## Pictures\n\n![Picture 1](https://gitea.test/attachments/1)\n![Picture 3](https://gitea.test/attachments/3)',
    );
    expect(withPictures('', [{ number: 2, url: 'u' }])).toBe('## Pictures\n\n![Picture 2](u)');
  });

  it('names the chosen pictures that are not attached yet', () => {
    expect(missingPictures([imageA, imageB], [{ image: imageA, url: 'u' }])).toEqual([imageB]);
  });
});
