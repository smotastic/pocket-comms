import { describe, expect, it } from 'vitest';
import { ANSWER_LENGTH, initialState, render } from './view.js';

describe('render', () => {
  it('shows a short answer whole', () => {
    expect(
      render({ ...initialState, answer: { messages: ['Nice.'], streaming: '' } }, 0).answer,
    ).toBe('Nice.');
  });

  it('cuts a long answer to what fits and says the rest is in comms', () => {
    const answer = render(
      { ...initialState, answer: { messages: ['a'.repeat(500)], streaming: '' } },
      0,
    ).answer;

    expect(answer).toBe(`${'a'.repeat(ANSWER_LENGTH - 1)}… The rest is in comms.`);
  });

  it('joins Pi’s messages of a turn and the one being written', () => {
    expect(
      render({ ...initialState, answer: { messages: ['One.', 'Two.'], streaming: 'Thr' } }, 0)
        .answer,
    ).toBe('One. Two. Thr');
  });

  it('counts the waiting clips and adds the last notice', () => {
    expect(
      render({ ...initialState, link: { _tag: 'Offline' }, waiting: 2, notice: 'Hm.' }, 0).status,
    ).toBe('Offline · 2 waiting · Hm.');
  });

  it('shows the time of a recording', () => {
    expect(render({ ...initialState, recordingSince: 1_000 }, 73_500).status).toBe(
      'Recording 1:12',
    );
  });
});
