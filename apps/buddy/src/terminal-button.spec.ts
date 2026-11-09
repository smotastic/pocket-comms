import { describe, expect, it } from 'vitest';
import { intentsOf } from './terminal-button.js';

describe('intentsOf', () => {
  it('turns every space into a toggle, whatever came before', () => {
    expect(intentsOf(' ')).toEqual([{ _tag: 'Toggle' }]);
    expect(intentsOf('  ')).toEqual([{ _tag: 'Toggle' }, { _tag: 'Toggle' }]);
  });

  it('creates with y and discards with n, in either case', () => {
    expect(intentsOf('yN')).toEqual([{ _tag: 'Create' }, { _tag: 'Discard' }]);
  });

  it('quits on Ctrl+C', () => {
    expect(intentsOf('\u0003')).toEqual([{ _tag: 'Quit' }]);
  });

  it('ignores every other key', () => {
    expect(intentsOf('ab\r')).toEqual([]);
  });
});
