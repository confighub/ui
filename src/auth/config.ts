// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Configuration a deployment supplies at runtime. The container's entrypoint
 * writes it to `/config.json` from environment variables, and the Vite dev server
 * serves it from the same variables; the app fetches it once before it boots
 * (`loadRuntimeConfig`). Every field is optional.
 */
export interface RuntimeConfig {
  /** Origin of the ConfigHub instance. Empty means the page's own origin. */
  apiBaseUrl?: string;
  /** The OAuth client_id this UI is registered as. Absent on an instance with no identity provider. */
  oauthClientId?: string;
  /** PostHog project key. Empty means no telemetry. */
  posthogKey?: string;
}

let runtime: RuntimeConfig = {};

let identityProvider = true;

/**
 * Fetch `/config.json`, then ask the instance whether it has an identity
 * provider. Anything but a JSON 200 for the config leaves the defaults: the page's
 * own origin and no client id, which is right for an instance with no identity
 * provider serving its own UI.
 */
export const loadRuntimeConfig = async (): Promise<void> => {
  try {
    const response = await fetch('/config.json', { cache: 'no-store' });
    if (response.ok && (response.headers.get('content-type') ?? '').includes('json')) {
      const parsed: unknown = await response.json();
      if (parsed && typeof parsed === 'object') runtime = parsed as RuntimeConfig;
    }
  } catch {
    // Unreachable or malformed: defaults apply.
  }
  try {
    const info = await fetch(apiBaseUrl() + '/api/info');
    // An instance with no identity provider advertises no issuer. One with a
    // provider but no issuer is misconfigured, not provider-less, and its login
    // attempt says so. A failure here is treated as "there is one", so an
    // unreachable /api/info also leads to a login attempt whose error says what
    // is wrong.
    if (info.ok) {
      const { AuthIssuer } = (await info.json()) as { AuthIssuer?: string };
      identityProvider = Boolean(AuthIssuer);
    }
  } catch {
    // Keep the default.
  }
};

const trimSlash = (s: string): string => s.replace(/\/+$/, '');

/** Origin of the ConfigHub instance: configured, or the page's own origin. */
export const apiBaseUrl = (): string => trimSlash(runtime.apiBaseUrl || window.location.origin);

/**
 * Whether the instance signs browsers in through an identity provider. Without
 * one, a browser is signed in by a ticket from `cub auth browser-session`.
 */
export const hasIdentityProvider = (): boolean => identityProvider;

/** The OAuth `client_id` this UI is registered as. */
export const oauthClientId = (): string => runtime.oauthClientId ?? '';

/** The PostHog project key from runtime config, if the config named one. */
export const runtimePosthogKey = (): string | undefined => runtime.posthogKey;

/** Turn an instance-relative path (`/api/...`) into the URL to fetch. */
export const instanceUrl = (path: string): string => apiBaseUrl() + path;
