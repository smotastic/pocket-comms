import { describe, expect, it } from 'vitest';
import { intentsOf } from './terminal-button.js';

describe('intentsOf', () => {
  it('turns each space into a press, then a release, in turn', () => {
    expect(intentsOf(' ', false)).toEqual({ intents: [{ _tag: 'Press' }], held: true });
    expect(intentsOf(' ', true)).toEqual({ intents: [{ _tag: 'Release' }], held: false });
    expect(intentsOf('  ', false).intents).toEqual([{ _tag: 'Press' }, { _tag: 'Release' }]);
  });

  it('creates with y and discards with n, in either case', () => {
    expect(intentsOf('yN', false).intents).toEqual([{ _tag: 'Create' }, { _tag: 'Discard' }]);
  });

  it('quits on Ctrl+C', () => {
    expect(intentsOf('\u0003', true).intents).toEqual([{ _tag: 'Quit' }]);
  });

  it('ignores every other key', () => {
    expect(intentsOf('ab\r', false)).toEqual({ intents: [], held: false });
  });
});
