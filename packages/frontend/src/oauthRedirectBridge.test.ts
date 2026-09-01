import { afterEach, describe, expect, it } from 'vitest';
import { bridgeOAuthRedirectToHashRoute } from './oauthRedirectBridge';

// The failure this guards against: landing on the *path* `/auth/callback`
// with the tokens in the query string, which the HashRouter never routes —
// the app boots at `/`, bounces to `#/login`, and the sign-in silently dies
// with a URL full of unread JWTs.

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('bridgeOAuthRedirectToHashRoute', () => {
  it('moves a path-shaped callback and its query into the fragment', () => {
    window.history.replaceState(null, '', '/auth/callback?accessToken=at&refreshToken=rt&remember=true');

    expect(bridgeOAuthRedirectToHashRoute()).toBe(true);

    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#/auth/callback?accessToken=at&refreshToken=rt&remember=true');
  });

  it('recovers a URL the router already bounced to #/login', () => {
    window.history.replaceState(null, '', '/auth/callback?accessToken=at&refreshToken=rt#/login');

    expect(bridgeOAuthRedirectToHashRoute()).toBe(true);

    expect(window.location.hash).toBe('#/auth/callback?accessToken=at&refreshToken=rt');
  });

  it('leaves a correctly hash-routed callback untouched', () => {
    window.history.replaceState(null, '', '/#/auth/callback?accessToken=at&refreshToken=rt');

    expect(bridgeOAuthRedirectToHashRoute()).toBe(false);

    expect(window.location.hash).toBe('#/auth/callback?accessToken=at&refreshToken=rt');
  });

  it('leaves every other route alone', () => {
    window.history.replaceState(null, '', '/#/vehicles?page=2');

    expect(bridgeOAuthRedirectToHashRoute()).toBe(false);

    expect(window.location.pathname).toBe('/');
    expect(window.location.hash).toBe('#/vehicles?page=2');
  });
});
