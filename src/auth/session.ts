// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { getAccessToken, type LoginOptions, type LogoutOptions } from '@confighub/react-auth';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { instanceUrl } from './config';

/** Where a browser learns how to sign in on an instance with no identity provider. */
export const CLI_SIGN_IN_PATH = '/cli-signin';

/**
 * The auth actions the app can take, independent of React. They are provided by
 * the auth flow in `./sdk`, whose provider registers them here on mount so code
 * outside the React tree (the RTK Query base query) can call them too.
 */
export interface AuthActions {
  login: (options?: LoginOptions) => Promise<void>;
  logout: (options?: LogoutOptions) => Promise<void>;
  reauthenticate: () => Promise<void>;
}

let actions: AuthActions | null = null;

/** @internal Called by the provider bridge in AuthRoot. */
export const registerAuthActions = (registered: AuthActions | null): void => {
  actions = registered;
};

const requireActions = (): AuthActions => {
  if (!actions) {
    throw new Error('auth actions not registered; is <AuthRoot> mounted?');
  }
  return actions;
};

const currentPath = (): string =>
  window.location.pathname + window.location.search + window.location.hash;

/**
 * Send the user to log in, coming back to `returnTo` (default: where they are).
 * The provider hints the organization of the last login, so this is silent for a
 * user with a live IdP session; see switchOrganization to change it.
 */
export const redirectToLogin = (returnTo: string = currentPath()): void => {
  void requireActions().login({ returnTo });
};

/**
 * Change organization: a fresh login that deliberately carries no organization
 * hint, so the identity provider prompts and the server mints for whichever was
 * picked. The provider otherwise hints the last organization, which keeps an
 * ordinary login silent.
 */
export const switchOrganization = (returnTo: string = currentPath()): void => {
  void requireActions().login({ returnTo, organization: null });
};

// One re-authentication at a time: a page that fires several requests on load
// gets several 401s, and each must not start its own redirect.
let reauthInFlight = false;

/**
 * The API said the session is no longer valid. The provider first tries silently
 * (`prompt=none`, same organization): if the IdP session is alive the user keeps
 * their place; if not, or if there is no identity provider to ask, the page comes
 * back `unauthenticated` and the session gate takes over.
 */
export const handleUnauthorized = (): void => {
  if (reauthInFlight) return;
  reauthInFlight = true;
  void requireActions().reauthenticate();
};

/**
 * The API refused a request (403). An account awaiting approval goes to the page that
 * says so, whose "try again" starts the fresh login that picks up the approval;
 * anything else goes to access-denied. Nothing happens on those pages themselves, so
 * a refusal there cannot loop.
 */
export const handleForbidden = (error: FetchBaseQueryError): void => {
  const here = window.location.pathname;
  if (here === '/access-denied' || here === '/pending-approval') return;
  const message = (error.data as { message?: string } | undefined)?.message ?? '';
  window.location.replace(message.includes('pending approval') ? '/pending-approval' : '/access-denied');
};

/** Sign out, ending the IdP session too so the next login asks again. */
export const logout = (): void => {
  void requireActions().logout({
    endSession: true,
    postLogoutRedirectUri: window.location.origin + '/',
  });
};

/**
 * `fetch` for the few call sites that bypass RTK Query: instance-relative path in,
 * bearer token attached.
 */
export const authFetch = (path: string, init: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(init.headers);
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(instanceUrl(path), { ...init, headers });
};
