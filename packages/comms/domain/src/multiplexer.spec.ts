import { describe, expect, it } from '@effect/vitest';
import { multiplexerName, statusOf } from './multiplexer.js';

describe('multiplexerName', () => {
  it('names each multiplexer as the owner knows it', () => {
    expect([multiplexerName('herdr'), multiplexerName('hc')]).toEqual(['Herdr', 'hc']);
  });
});

describe('statusOf', () => {
  it.each(['idle', 'working', 'blocked', 'done'] as const)('keeps %s as it is', (state) => {
    expect(statusOf(state)).toBe(state);
  });

  it('reads an error as blocked: the agent needs the owner', () => {
    expect(statusOf('error')).toBe('blocked');
  });

  it.each([undefined, 'clear', 'thinking'])('reads %s as unknown', (state) => {
    expect(statusOf(state)).toBe('unknown');
  });
});
