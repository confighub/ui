// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { chromium } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as dotenv from 'dotenv';
import { writeFileSync } from 'fs';

import {
  SESSION_FILE,
  SESSION_KEY,
  STORAGE_STATE,
  type SavedSession,
} from './tests/fixtures/test';

dotenv.config();

// Unbuffered output that appears immediately
const log = (msg: string) => process.stdout.write(`[globalSetup] ${msg}\n`);

// Hard timeout wrapper for entire setup
const withTimeout = <T>(promise: Promise<T>, ms: number, name: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms),
    ),
  ]);
};

/**
 * The ConfigHub instance behind the UI under test, found the way the app finds it:
 * its /config.json apiBaseUrl, and without one the UI's own origin. Whether that
 * instance has an identity provider decides how the suite signs in.
 */
async function discoverInstance(
  baseOrigin: string,
): Promise<{ apiUrl: string; authIssuer?: string }> {
  let apiBaseUrl: string | undefined;
  const response = await fetch(`${baseOrigin}/config.json`, { cache: 'no-store' }).catch(
    () => undefined,
  );
  if (response?.ok && (response.headers.get('content-type') ?? '').includes('json')) {
    apiBaseUrl = ((await response.json()) as { apiBaseUrl?: string }).apiBaseUrl;
  }
  const apiUrl = (apiBaseUrl || baseOrigin).replace(/\/+$/, '');
  const info = (await (await fetch(`${apiUrl}/api/info`)).json()) as { AuthIssuer?: string };
  return { apiUrl, authIssuer: info.AuthIssuer || undefined };
}

/**
 * The sign-in link for an instance with no identity provider: a single-use ticket
 * from `cub auth browser-session`, signed in as cub's current context, on the UI
 * under test. The link cub prints names the UI the server is configured with, or
 * the server's origin; the ticket is what matters, so it is moved onto
 * TEST_BASE_URL's origin, which also covers a UI the server does not know about.
 */
function cubSignInLink(baseOrigin: string): string {
  const cub = process.env.TEST_CUB || 'cub';
  const output = execFileSync(cub, ['auth', 'browser-session', '--no-browser'], {
    encoding: 'utf8',
  });
  const printed = output.match(/https?:\/\/\S*\/cli-signin#ticket=\S+/)?.[0];
  if (!printed) {
    throw new Error(
      `\`${cub} auth browser-session --no-browser\` printed no sign-in link:\n${output}`,
    );
  }
  const link = new URL(printed);
  return `${baseOrigin}${link.pathname}${link.hash}`;
}

async function globalSetup() {
  log('Starting global setup...');

  const baseURL = process.env.TEST_BASE_URL;
  const username = process.env.TEST_USER;
  const password = process.env.TEST_PASSWORD;

  log(`TEST_BASE_URL: ${baseURL ? 'set' : 'NOT SET'}`);
  if (!baseURL) {
    throw new Error('⚠️ Please set TEST_BASE_URL in your environment');
  }
  const baseOrigin = new URL(baseURL).origin;
  const { apiUrl, authIssuer } = await discoverInstance(baseOrigin);
  log(
    `API at ${apiUrl}; ${authIssuer ? `identity provider ${authIssuer}` : 'no identity provider'}`,
  );

  if (authIssuer) {
    log(`TEST_USER: ${username ? 'set' : 'NOT SET'}`);
    log(`TEST_PASSWORD: ${password ? 'set' : 'NOT SET'}`);
    if (!username || !password) {
      throw new Error('⚠️ Please set TEST_USER and TEST_PASSWORD in your environment');
    }
  }

  // 1) launch browser & create context
  log('Launching browser...');
  const browser = await withTimeout(chromium.launch(), 30000, 'Browser launch');
  log('Browser launched');

  const context = await browser.newContext();
  log('Context created');

  try {
    const page = await context.newPage();
    log('Page created');

    if (!authIssuer) {
      // No identity provider: the browser is signed in by handoff from cub, the
      // way a person would do it with `cub auth browser-session`.
      log('Signing in with a ticket from cub auth browser-session...');
      await page.goto(cubSignInLink(baseOrigin), {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
    } else {
      // 2) go to the login page with extended timeout
      log(`Navigating to ${baseURL}...`);
      try {
        await page.goto(`${baseURL}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        log(`Successfully loaded ${baseURL}`);
        log(`Current URL: ${page.url()}`);
      } catch (error) {
        log(`Failed to navigate to ${baseURL}: ${error}`);
        log('Taking screenshot for debugging...');
        await page.screenshot({ path: 'navigation-error.png', fullPage: true });
        throw error;
      }

      // 3) wait for email field to be visible and fill it
      log('Waiting for email field...');
      const emailField = page.getByRole('textbox', { name: 'Email' });
      try {
        await emailField.waitFor({ state: 'visible', timeout: 30000 });
        await emailField.fill(username);
        log('Email filled');
      } catch (error) {
        log(`Email field not found: ${error}`);
        log(`Current URL: ${page.url()}`);
        await page.screenshot({ path: 'email-field-error.png', fullPage: true });
        throw error;
      }

      // 4) advance the identity-first step: the confighub Keycloak theme inherits
      // keycloak.v2, which serves username (login-username.ftl) and password
      // (login-password.ftl) on separate pages. Submit the username form so the
      // password page loads. Press Enter in the username field rather than click
      // a button (the submit is "Sign In" / #kc-login, not "Continue").
      log('Submitting username (Enter)...');
      await emailField.press('Enter');

      // 4b) a test account that belongs to more than one organization is routed
      // through an org picker before the password page. Optional: most single-org
      // accounts skip straight to the password field, so this only acts when the
      // picker actually appears (short timeout, no-op otherwise).
      const orgOption = page.getByText(process.env.TEST_ORG || 'E2E_tests', { exact: true });
      if (await orgOption.isVisible({ timeout: 5000 }).catch(() => false)) {
        log(`Org picker shown — selecting "${process.env.TEST_ORG || 'E2E_tests'}"...`);
        await orgOption.click();
      }

      // 5) wait for password field (appears on the next page) and fill it
      log('Waiting for password field...');
      const passwordField = page.locator('input[name="password"]');
      try {
        await passwordField.waitFor({ state: 'visible', timeout: 30000 });
      } catch (error) {
        log(`Password field not found: ${error}`);
        log(`Current URL: ${page.url()}`);
        await page.screenshot({ path: 'password-field-error.png', fullPage: true });
        throw error;
      }
      await passwordField.fill(password);
      log('Password filled');

      log('Clicking Sign In button...');
      await page
        .locator('#kc-login, button[type="submit"], input[type="submit"]')
        .first()
        .click();

      // 5) sanity-check: make sure we're back on our own app, not stuck on the
      // identity provider's domain. The exact landing path isn't asserted here
      // since it depends on client-side routing (e.g. the root route redirects
      // to /units) rather than anything the auth flow itself controls.
      log('Waiting for redirect back to the app...');
      await page.waitForURL((url) => url.origin === baseOrigin, { timeout: 30000 });
      log('Back on the app origin');
    }

    // 6) wait for the app's OWN session before saving.
    //
    // Landing back on the app's origin is not the end of signing in: the SPA
    // still exchanges the IdP's token for a ConfigHub token, and only then keeps
    // it in sessionStorage. Saving on the redirect alone is a race, and when it
    // loses the saved session is empty. Nothing fails at that point, and every
    // spec then 401s on its first API call, which reads as a broken backend
    // rather than a half-saved login.
    const deadline = Date.now() + 30000;
    let session: string | null = null;
    while (Date.now() < deadline) {
      session = await page.evaluate((key) => window.sessionStorage.getItem(key), SESSION_KEY);
      if (session) break;
      await page.waitForTimeout(500);
    }
    if (!session) {
      await page.screenshot({ path: 'session-missing.png', fullPage: true });
      throw new Error(
        `Signed in and returned to the app, but no ${SESSION_KEY} appeared in sessionStorage ` +
          'within 30s. Saving now would produce a session that authenticates nothing; ' +
          'failing here instead so the cause is visible.',
      );
    }
    log('Successfully authenticated!');

    // 7) save the session, and the storage state (the IdP's cookies and the
    // remembered organization) beside it. storageState does not capture
    // sessionStorage, which is where the session lives; tests/fixtures/test.ts
    // puts it back into every context.
    const { accessToken } = JSON.parse(session) as { accessToken: string };
    const saved: SavedSession = {
      origin: baseOrigin,
      value: session,
      accessToken,
      apiUrl,
      hasIdentityProvider: Boolean(authIssuer),
    };
    writeFileSync(SESSION_FILE, JSON.stringify(saved));
    await context.storageState({ path: STORAGE_STATE });
    log('Session and storage state saved');
  } catch (error) {
    log(`Authentication failed: ${error}`);
    throw error;
  } finally {
    await context.close();
    await browser.close();
    log('Cleanup complete');
  }
}

// Export with 2-minute hard timeout on entire setup
export default () => withTimeout(globalSetup(), 120000, 'Global setup');
