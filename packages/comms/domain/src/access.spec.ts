import { describe, expect, it } from '@effect/vitest';
import { isAllowedLogin } from './access.js';

describe('isAllowedLogin', () => {
  it.each(['smotastic@github', 'smotastic@passkey'])(
    'lets %s in when the allowed login names the user with any provider',
    (login) => {
      expect(isAllowedLogin(login, 'smotastic@')).toBe(true);
    },
  );

  it.each([
    ['someone@github', 'smotastic@'],
    ['smotastic@github.evil@x', 'smotastic@github'],
    ['smotastic', 'smotastic@'],
    ['', 'smotastic@'],
    ['smotastic@github', 'smotastic@gitlab'],
  ])('keeps %s out when the allowed login is %s', (login, allowed) => {
    expect(isAllowedLogin(login, allowed)).toBe(false);
  });

  it('matches a complete login exactly', () => {
    expect(isAllowedLogin('smotastic@github', 'smotastic@github')).toBe(true);
  });

  it('keeps a request without a login out', () => {
    expect(isAllowedLogin(undefined, 'smotastic@')).toBe(false);
  });

  it('lets nobody in when the allowed login is empty or only a provider', () => {
    expect(isAllowedLogin('@github', '@')).toBe(false);
    expect(isAllowedLogin('anyone@github', '')).toBe(false);
  });
});
