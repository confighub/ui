// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Header } from './fixtures/header';
import { expect, hasIdentityProvider, test } from './fixtures/test';
import { UnitListPage } from './fixtures/unit-list-page';

const TEST_BASE_URL = process.env.TEST_BASE_URL ?? '';

/**
 * A URL that proves the logout redirect happened. Deliberately enumerates the
 * known logout endpoints rather than matching loosely on "logout" anywhere,
 * so an unrelated navigation can never satisfy it:
 *  - `/auth/logout`                      — the server's logout route (no identity provider)
 *  - `/protocol/openid-connect/logout`   — Keycloak's RP-initiated logout
 */
const isLogoutUrl = (href: string): boolean =>
  href.includes('/auth/logout') ||
  href.includes('/protocol/openid-connect/logout');

test.describe('header', () => {
  test.use({ storageState: 'authentication.json' });

  let header: Header;

  test.beforeEach(async ({ page }) => {
    header = new Header(page);
    await new UnitListPage(page).goto();
    // The organization name arrives at the end of a chain of requests (config.json, the
    // bundle, /api/me, /api/organization) that can exceed the default timeout on a busy
    // runner; the header is ready once it has.
    await expect(header.organizationSwitcher).not.toBeEmpty({ timeout: 20000 });
  });

  test('should navigate to logout when logout is clicked', async ({ page }) => {
    // Without an identity provider there is no end-session redirect to observe:
    // logout clears the session and returns to /, and the fixture restores the
    // saved session on every load, so the page signs straight back in.
    test.skip(!hasIdentityProvider(), 'RP-initiated logout needs an identity provider');
    // Logging out ends the identity provider's session, whose endpoint redirects
    // straight back. Answer it locally so the navigation settles on the logout URL
    // and the test does not end the session the saved login belongs to.
    await page.route('**/protocol/openid-connect/logout?*', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: 'logged out' }),
    );

    // Click logout and wait for navigation
    await Promise.all([page.waitForURL((url) => isLogoutUrl(url.href)), header.logout()]);

    // Verify we navigated away from the app
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/units');

    // Should be on the app's logout route or the identity provider's logout endpoint
    expect(isLogoutUrl(currentUrl), `Not a recognised logout URL: ${currentUrl}`).toBeTruthy();
  });

  test('should start a fresh login when switching organization', async ({ page }) => {
    test.skip(
      !hasIdentityProvider(),
      'switching organization is a login at the identity provider',
    );
    // Switching is a fresh login at the identity provider that sends no
    // organization hint, so the provider asks which one. Answer the authorize
    // request locally so the test asserts the URL the UI navigates to without
    // depending on the identity provider's response to it.
    await page.route('**/protocol/openid-connect/auth?*', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: 'login' }),
    );

    await Promise.all([
      page.waitForURL((url) => url.pathname.endsWith('/protocol/openid-connect/auth')),
      header.switchOrganization(),
    ]);

    const authorizeUrl = new URL(page.url());
    const scopes = (authorizeUrl.searchParams.get('scope') ?? '').split(' ');
    expect(scopes).toContain('organization');
    expect(scopes.some((scope) => scope.startsWith('organization:'))).toBe(false);
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(
      `${new URL(TEST_BASE_URL).origin}/`,
    );
  });
});
