// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Route } from '@playwright/test';
import { test, expect } from './fixtures/test';

// ============================================================================
// Components View Error State E2E Tests
//
// Forces the Components view's live `/space` query to fail three ways
// (network abort, 500, 404) and asserts the cause-aware error state renders
// the right headline, exposes the endpoint via Technical detail, and that
// Retry recovers the page once the network condition clears.
//
// Only the *live* org-wide query (no `summary=true` param) is intercepted.
// The summary query is left to `route.continue()` so it does not also need
// mocking — `isSpacesError` (and therefore this error branch) depends only
// on the scoped/live queries, never on summary alone.
//
// On `/components` (no `?app=` param), `useComponentSpaces` skips its scoped
// query entirely, so exactly two `/api/space` requests are in flight: the
// live query (`select=...`, no `summary` param) and the summary query
// (`summary=true`). Nothing else on this route calls `/api/space` — the
// `Header` used by `AppsComponentPage` (`@/components/header/Header`, not
// the `header-new` variant) does not query spaces, and `AuthenticatedContext`
// bootstraps via `GET /api/me`, not `/api/space`. So narrowing on
// `summary !== 'true'` is sufficient here and does not touch app bootstrap.
// ============================================================================

function isLiveSpacesRequest(url: string): boolean {
  const parsed = new URL(url);
  return parsed.pathname.endsWith('/space') && parsed.searchParams.get('summary') !== 'true';
}

test.describe('components view error state', () => {
  test.use({ storageState: 'authentication.json' });

  test('shows a network-failure headline and recovers on retry', async ({ page }) => {
    let shouldFail = true;
    let liveRequestCount = 0;
    await page.route('**/api/space**', async (route: Route) => {
      if (isLiveSpacesRequest(route.request().url())) {
        liveRequestCount += 1;
        if (shouldFail) {
          await route.abort('failed');
          return;
        }
        await route.continue();
        return;
      }
      await route.continue();
    });

    await page.goto('/components');

    const errorState = page.getByTestId('query-error-state');
    await expect(errorState).toBeVisible({ timeout: 15000 });
    await expect(errorState).toContainText('Cannot reach the ConfigHub server');

    await page.getByTestId('query-error-detail-toggle').click();
    const detail = page.getByTestId('query-error-detail');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('Endpoint: GET /space');
    await expect(detail).toContainText('Failed query: live spaces');

    shouldFail = false;
    const countBeforeRetry = liveRequestCount;
    await page.getByTestId('query-error-retry').click();

    // Retry must issue a new request promptly — well under the 5s live-poll
    // interval — so this cannot be satisfied by the next scheduled poll tick
    // instead of the click.
    await expect.poll(() => liveRequestCount, { timeout: 1000 }).toBeGreaterThan(countBeforeRetry);

    await expect(errorState).not.toBeVisible({ timeout: 15000 });
    // The error state disappearing isn't proof of recovery on its own — RTK
    // Query clears `isError` as soon as the retry request dispatches, before
    // it settles, and `AppsComponentPage` falls through to the loading
    // skeleton (not the error state) while `!isSpacesLoaded`. Assert the real
    // `AppsComponentLayout` actually mounted, not just that the error state
    // went away.
    await expect(page.getByTestId('components-layout')).toBeVisible({ timeout: 15000 });
  });

  test('shows a server-error headline for a 500 response', async ({ page }) => {
    await page.route('**/api/space**', async (route: Route) => {
      if (isLiveSpacesRequest(route.request().url())) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'internal error' }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/components');

    const errorState = page.getByTestId('query-error-state');
    await expect(errorState).toBeVisible({ timeout: 15000 });
    await expect(errorState).toContainText('The server had an internal error');
  });

  test('shows a not-found headline for a 404 response', async ({ page }) => {
    await page.route('**/api/space**', async (route: Route) => {
      if (isLiveSpacesRequest(route.request().url())) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'not found' }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/components');

    const errorState = page.getByTestId('query-error-state');
    await expect(errorState).toBeVisible({ timeout: 15000 });
    await expect(errorState).toContainText('This Space was not found');
  });
});
