/**
 * Whether a Tailscale login may use the app (spec 004, requirement 21). An allowed login that ends
 * in `@` names a user with any identity provider (`smotastic@` lets `smotastic@github` in); any
 * other allowed login must match exactly. A missing login, or an allowed login without a user
 * name, lets nobody in.
 */
export const isAllowedLogin = (login: string | undefined, allowed: string): boolean => {
  if (login === undefined || allowed === '' || allowed.startsWith('@')) return false;
  if (!allowed.endsWith('@')) return login === allowed;
  const provider = login.slice(allowed.length);
  return login.startsWith(allowed) && provider !== '' && !provider.includes('@');
};
