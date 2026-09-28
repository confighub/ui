// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

import { Header } from './fixtures/header';
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

  let unitListPage: UnitListPage;
  let header: Header;

  test.beforeEach(async ({ page }) => {
    unitListPage = new UnitListPage(page);
    header = new Header(page);
    await unitListPage.goto();
    // The organization name arrives at the end of a chain of requests (config.json, the
    // bundle, /api/me, /api/organization) that can exceed the default timeout on a busy
    // runner; the header is ready once it has.
    await expect(header.organizationSwitcher).not.toBeEmpty({ timeout: 20000 });
  });

  test('should display user avatar in header', async () => {
    // Check that the user avatar is visible
    await expect(header.userAvatar).toBeVisible();
  });

  test('should close user menu when clicking outside', async () => {
    // Open the menu
    await header.openUserMenu();

    // Verify menu is open
    await expect(header.userMenu).toBeVisible();

    // Close the menu
    await header.closeUserMenu();

    // Verify menu is closed
    await expect(header.userMenu).not.toBeVisible();
  });

  test('should display user tooltip on hover', async () => {
    // Get the user display name from tooltip
    const displayName = await header.getUserDisplayName();

    // Verify tooltip shows a display name
    expect(displayName).toBeTruthy();
    expect(displayName?.length).toBeGreaterThan(0);
  });

  test('should navigate to logout when logout is clicked', async ({ page }) => {
    // Logging out ends the identity provider's session, whose endpoint redirects
    // straight back. Answer it locally so the navigation settles on the logout URL
    // and the test does not end the session the saved login belongs to.
    await page.route('**/protocol/openid-connect/logout?*', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: 'logged out' }),
    );

    // Click logout and wait for navigation
    await Promise.all([
      page.waitForURL((url) => isLogoutUrl(url.href)),
      header.logout(),
    ]);

    // Verify we navigated away from the app
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/units');

    // Should be on the app's logout route or the identity provider's logout endpoint
    expect(isLogoutUrl(currentUrl), `Not a recognised logout URL: ${currentUrl}`).toBeTruthy();
  });

  test('should display organization switcher', async () => {
    await expect(header.organizationSwitcher).toBeVisible();
  });

  test('should show current organization name', async () => {
    const currentOrg = await header.getCurrentOrganization();
    expect(currentOrg).toBeTruthy();
  });

  test('should offer to switch organization from the menu', async () => {
    // The menu carries no list of organizations: picking one is the identity
    // provider's job, so the only entry is the switch action itself.
    await header.openOrganizationMenu();
    await expect(header.organizationMenu.getByRole('menuitem')).toHaveCount(1);

    await header.closeOrganizationMenu();
  });

  test('should start a fresh login when switching organization', async ({ page }) => {
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
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(`${new URL(TEST_BASE_URL).origin}/`);
  });
});
