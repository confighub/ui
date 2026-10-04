// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// Signs every test's browser context in with the session global.setup.ts saved.
//
// The UI keeps its session in sessionStorage, which Playwright's storageState does
// not capture, so a saved storage state alone authenticates nothing. The session is
// saved to its own file instead and put back here, before any page loads. Specs
// import `test` from this file rather than from '@playwright/test'; a context a spec
// makes itself goes through newAuthorizedContext, and a page it makes itself through
// newAuthorizedPage. A spec that calls the API directly does so through `hubApi`,
// which talks to the ConfigHub instance the UI under test uses, not to the UI's origin.
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
  test as base,
  request,
} from '@playwright/test';
import { existsSync, readFileSync } from 'fs';

export { expect } from '@playwright/test';

/** Cookies and localStorage from the login, including the IdP's own session. */
export const STORAGE_STATE = 'authentication.json';

/** The UI's session from the login: where it lives and what it holds. */
export const SESSION_FILE = 'authentication-session.json';

/** The sessionStorage key the UI's auth provider restores its session from. */
export const SESSION_KEY = 'confighub_session';

export interface SavedSession {
  /** The app origin the session belongs to; sessionStorage is per origin. */
  origin: string;
  /** The stored value, verbatim. */
  value: string;
  /** The ConfigHub token inside it, for direct API calls. */
  accessToken: string;
  /** The ConfigHub instance the UI talks to: its /config.json apiBaseUrl, else its origin. */
  apiUrl: string;
  /** Whether that instance signs people in through an identity provider (it advertises AuthIssuer). */
  hasIdentityProvider: boolean;
}

/**
 * Whether the instance under test has an identity provider, as global setup found it.
 * A spec asserting identity-provider behaviour (organization switching, RP-initiated
 * logout) skips without one.
 */
export const hasIdentityProvider = (): boolean => savedSession()?.hasIdentityProvider ?? true;

const savedSession = (): SavedSession | undefined =>
  existsSync(SESSION_FILE)
    ? (JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as SavedSession)
    : undefined;

/**
 * Put the saved session into every page of `context` before the app boots. A page
 * that already has a session (because the app replaced it) keeps its own. Without a
 * saved session, as under the browser-free config, this does nothing.
 */
export const authorize = async (context: BrowserContext): Promise<void> => {
  const session = savedSession();
  if (!session) return;
  await context.addInitScript(
    ({ origin, key, value }) => {
      if (window.location.origin === origin && !window.sessionStorage.getItem(key)) {
        window.sessionStorage.setItem(key, value);
      }
    },
    { origin: session.origin, key: SESSION_KEY, value: session.value },
  );
};

let apiContext: Promise<APIRequestContext> | undefined;

const apiRequest = (): Promise<APIRequestContext> => {
  apiContext ??= (async () => {
    const session = savedSession();
    if (!session) throw new Error(`no ${SESSION_FILE}: global.setup.ts has not signed in`);
    return request.newContext({
      baseURL: session.apiUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${session.accessToken}` },
    });
  })();
  return apiContext;
};

/**
 * The ConfigHub API, signed in as the test user: `hubApi.get('/api/space')` and so
 * on, with the same arguments and results as Playwright's APIRequestContext. Paths
 * are the instance's, so this reaches the API wherever the UI under test is served
 * from. One request context per worker, made on first use.
 */
export const hubApi = {
  get: async (...args: Parameters<APIRequestContext['get']>) =>
    (await apiRequest()).get(...args),
  post: async (...args: Parameters<APIRequestContext['post']>) =>
    (await apiRequest()).post(...args),
  put: async (...args: Parameters<APIRequestContext['put']>) =>
    (await apiRequest()).put(...args),
  patch: async (...args: Parameters<APIRequestContext['patch']>) =>
    (await apiRequest()).patch(...args),
  delete: async (...args: Parameters<APIRequestContext['delete']>) =>
    (await apiRequest()).delete(...args),
  fetch: async (...args: Parameters<APIRequestContext['fetch']>) =>
    (await apiRequest()).fetch(...args),
  head: async (...args: Parameters<APIRequestContext['head']>) =>
    (await apiRequest()).head(...args),
};

/** A signed-in context, for a spec that needs one besides its own `context`. */
export const newAuthorizedContext = async (
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<BrowserContext> => {
  const context = await browser.newContext({ storageState: STORAGE_STATE, ...options });
  await authorize(context);
  return context;
};

/**
 * A signed-in page in a context of its own, for a spec that would otherwise call
 * browser.newPage(). Close it with `page.context().close()`, which closes the page
 * too: unlike browser.newPage(), closing the page leaves its context open.
 */
export const newAuthorizedPage = async (
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<Page> => (await newAuthorizedContext(browser, options)).newPage();

export const test = base.extend({
  // Playwright's fixture callback, named so the React hooks lint rule does not
  // take it for a hook.
  context: async ({ context }, provide) => {
    await authorize(context);
    await provide(context);
  },
});
