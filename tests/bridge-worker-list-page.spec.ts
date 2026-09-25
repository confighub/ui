// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

import { WorkerListPage } from './fixtures/worker-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

test.describe('bridge worker list page', () => {
    // Apply this configuration to all tests and hooks within this describe block.
    // This tells Playwright to initialize contexts for this describe block
    // using the specified storageState.
    test.use({ storageState: 'authentication.json' });

    test('should add a bridge worker', async ({ page }) => {
        const workerName = RandomSlugGenerator.randomSlugName();

        const workerListPage = new WorkerListPage(page);

        await workerListPage.goto();
        await workerListPage.addWorker(workerName);

        await workerListPage.getRowByName(workerName);
    });

    test('should delete a bridge worker', async ({ page }) => {
        const workerName = RandomSlugGenerator.randomSlugName();

        const workerListPage = new WorkerListPage(page);

        await workerListPage.goto();
        await workerListPage.addWorker(workerName);

        await workerListPage.deleteWorker(workerName);

        await expect(page.getByRole('row', { name: workerName })).not.toBeVisible();
    });

    test('should add delete gates to bridge workers and prevent deletion', async ({ page }) => {
        const workerName = RandomSlugGenerator.randomSlugName();
        const deleteGate = 'production-protection';

        const workerListPage = new WorkerListPage(page);

        // Create a bridge worker
        await workerListPage.goto();
        await workerListPage.addWorker(workerName);

        // Verify worker exists
        await workerListPage.getRowByName(workerName);

        // Add delete gate to the worker
        await workerListPage.editWorkerWithDeleteGates({
            workerName,
            deleteGates: [deleteGate],
        });

        // Attempt to delete the worker and expect it to fail with delete gate error
        await workerListPage.attemptDeleteWorkerByNameExpectingError(
            workerName,
            'Error: outstanding DeleteGates',
        );

        // Verify the worker still exists (wasn't deleted)
        await workerListPage.getRowByName(workerName);
    });

    test('should filter the bridge worker list', async ({ page }) => {
        const workerName = RandomSlugGenerator.randomSlugName();

        const workerListPage = new WorkerListPage(page);

        // Create a bridge worker
        await workerListPage.goto();
        await workerListPage.addWorker(workerName);

        // Apply filter for the specific worker
        await workerListPage.filterWorkers(`Slug = '${workerName}'`);

        // Verify the worker is visible after filter
        await expect(page.getByRole('row', { name: workerName })).toBeVisible();

        // Clear filters
        await workerListPage.clearFilters();

        // The worker should still be visible (no filter applied)
        await expect(page.getByRole('row', { name: workerName })).toBeVisible();
    });

    test('should show empty state when filter matches nothing', async ({ page }) => {
        const workerListPage = new WorkerListPage(page);

        await workerListPage.goto();

        // Apply filter that matches nothing
        await workerListPage.filterWorkers(`Slug = 'nonexistent-worker-12345'`);

        // Verify the filtered empty state is shown
        await expect(page.getByText('No matching workers')).toBeVisible();

        // Click clear filters button in the empty state
        await page.getByRole('button', { name: 'Clear all filters' }).click();

        // Wait for data to reload — empty state should disappear
        await expect(page.getByText('No matching workers')).not.toBeVisible();
    });

    // Edit Drawer URL Tests
    test.describe('Edit drawer URL', () => {
        test('should open edit drawer when clicking worker name link', async ({ page }) => {
            const workerName = RandomSlugGenerator.randomSlugName();
            const workerListPage = new WorkerListPage(page);

            // Create a worker first
            await workerListPage.goto();
            await workerListPage.addWorker(workerName);

            // Ensure the add worker drawer is fully closed before proceeding
            await workerListPage.ensureDrawersClosed();

            // Click on the worker name link to open the edit drawer
            const workerLink = page.locator('[data-field="Slug"] a', { hasText: workerName });
            await workerLink.click();

            // Verify the drawer opened
            await expect(page.getByRole('heading', { name: 'Edit Bridge Worker' })).toBeVisible();

            // Verify URL contains edit param
            await expect(page).toHaveURL(/edit=/);
        });

        test('should close edit drawer and clear URL when clicking back button', async ({ page }) => {
            const workerName = RandomSlugGenerator.randomSlugName();
            const workerListPage = new WorkerListPage(page);

            // Create a worker first
            await workerListPage.goto();
            await workerListPage.addWorker(workerName);

            // Ensure the add worker drawer is fully closed before proceeding
            await workerListPage.ensureDrawersClosed();

            // Click on the worker name link to open the edit drawer
            const workerLink = page.locator('[data-field="Slug"] a', { hasText: workerName });
            await workerLink.click();

            // Verify the drawer opened
            await expect(page.getByRole('heading', { name: 'Edit Bridge Worker' })).toBeVisible();

            // Click the back button to close the drawer
            await page.getByRole('button', { name: 'Back to Bridge Workers' }).click();

            // Verify the drawer closed
            await expect(page.getByRole('heading', { name: 'Edit Bridge Worker' })).not.toBeVisible();

            // Verify URL no longer contains edit param
            await expect(page).not.toHaveURL(/edit=/);
        });

        test('should close edit drawer and clear URL when pressing Escape', async ({ page }) => {
            const workerName = RandomSlugGenerator.randomSlugName();
            const workerListPage = new WorkerListPage(page);

            // Create a worker first
            await workerListPage.goto();
            await workerListPage.addWorker(workerName);

            // Ensure the add worker drawer is fully closed before proceeding
            await workerListPage.ensureDrawersClosed();

            // Click on the worker name link to open the edit drawer
            const workerLink = page.locator('[data-field="Slug"] a', { hasText: workerName });
            await workerLink.click();

            // Verify the drawer opened
            await expect(page.getByRole('heading', { name: 'Edit Bridge Worker' })).toBeVisible();

            // Press Escape to close the drawer
            await page.keyboard.press('Escape');

            // Verify the drawer closed
            await expect(page.getByRole('heading', { name: 'Edit Bridge Worker' })).not.toBeVisible();

            // Verify URL no longer contains edit param
            await expect(page).not.toHaveURL(/edit=/);
        });

        test('should restore edit drawer from URL on page load', async ({ page }) => {
            const workerName = RandomSlugGenerator.randomSlugName();
            const workerListPage = new WorkerListPage(page);

            // Create a worker first
            await workerListPage.goto();
            await workerListPage.addWorker(workerName);

            // Ensure the add worker drawer is fully closed before proceeding
            await workerListPage.ensureDrawersClosed();

            // Get the worker ID from the link href
            const workerLink = page.locator('[data-field="Slug"] a', { hasText: workerName });
            const href = await workerLink.getAttribute('href');
            const workerId = href?.split('edit=')[1];

            expect(workerId).toBeTruthy();

            // Navigate directly to URL with edit param
            await page.goto(`/bridge-workers?edit=${workerId}`);

            // Wait for the drawer to open (data needs to load first)
            // The drawer opens after the worker data is fetched
            await expect(page.getByRole('heading', { name: 'Edit Bridge Worker' })).toBeVisible({ timeout: 10000 });
        });

        test('should preserve edit drawer state on page refresh', async ({ page }) => {
            const workerName = RandomSlugGenerator.randomSlugName();
            const workerListPage = new WorkerListPage(page);

            // Create a worker first
            await workerListPage.goto();
            await workerListPage.addWorker(workerName);

            // Ensure the add worker drawer is fully closed before proceeding
            await workerListPage.ensureDrawersClosed();

            // Click on the worker name link to open the edit drawer
            const workerLink = page.locator('[data-field="Slug"] a', { hasText: workerName });
            await workerLink.click();

            // Verify the drawer opened
            await expect(page.getByRole('heading', { name: 'Edit Bridge Worker' })).toBeVisible();

            // Capture the URL
            const urlWithEdit = page.url();
            expect(urlWithEdit).toContain('edit=');

            // Refresh the page
            await page.reload();

            // Wait for the drawer to open (data needs to load first after refresh)
            await expect(page.getByRole('heading', { name: 'Edit Bridge Worker' })).toBeVisible({ timeout: 10000 });
        });

        test('should preserve existing URL params when opening edit drawer', async ({ page }) => {
            const workerName = RandomSlugGenerator.randomSlugName();
            const workerListPage = new WorkerListPage(page);

            // Create a worker first
            await workerListPage.goto();
            await workerListPage.addWorker(workerName);

            // Ensure the add worker drawer is fully closed before proceeding
            await workerListPage.ensureDrawersClosed();

            // Wait for worker to appear in the list
            await expect(page.locator('[data-field="Slug"] a', { hasText: workerName })).toBeVisible({ timeout: 10000 });

            // Apply a filter first
            await workerListPage.filterWorkers(`Slug = '${workerName}'`);

            // Wait for filter to be applied
            await expect(page).toHaveURL(/filterWhere=/, { timeout: 5000 });

            // Wait for the filtered worker to be visible
            await expect(page.locator('[data-field="Slug"] a', { hasText: workerName })).toBeVisible({ timeout: 10000 });

            // Click on the worker name link to open the edit drawer
            const workerLink = page.locator('[data-field="Slug"] a', { hasText: workerName });
            await workerLink.click();

            // Verify the drawer opened
            await expect(page.getByRole('heading', { name: 'Edit Bridge Worker' })).toBeVisible({ timeout: 10000 });

            // Verify both edit param AND filter param are preserved in URL
            await expect(page).toHaveURL(/edit=/);
            await expect(page).toHaveURL(/filterWhere=/);
        });

        test('should preserve existing URL params when closing edit drawer', async ({ page }) => {
            const workerName = RandomSlugGenerator.randomSlugName();
            const workerListPage = new WorkerListPage(page);

            // Create a worker first
            await workerListPage.goto();
            await workerListPage.addWorker(workerName);

            // Ensure the add worker drawer is fully closed before proceeding
            await workerListPage.ensureDrawersClosed();

            // Wait for worker to appear in the list
            await expect(page.locator('[data-field="Slug"] a', { hasText: workerName })).toBeVisible({ timeout: 10000 });

            // Apply a filter first
            await workerListPage.filterWorkers(`Slug = '${workerName}'`);

            // Wait for filter to be applied
            await expect(page).toHaveURL(/filterWhere=/, { timeout: 5000 });

            // Wait for the filtered worker to be visible
            await expect(page.locator('[data-field="Slug"] a', { hasText: workerName })).toBeVisible({ timeout: 10000 });

            // Click on the worker name link to open the edit drawer
            const workerLink = page.locator('[data-field="Slug"] a', { hasText: workerName });
            await workerLink.click();

            // Verify the drawer opened
            await expect(page.getByRole('heading', { name: 'Edit Bridge Worker' })).toBeVisible({ timeout: 10000 });

            // Close the drawer via back button
            await page.getByRole('button', { name: 'Back to Bridge Workers' }).click();

            // Verify the drawer closed
            await expect(page.getByRole('heading', { name: 'Edit Bridge Worker' })).not.toBeVisible();

            // Verify edit param is removed but filter param is preserved
            await expect(page).not.toHaveURL(/edit=/);
            await expect(page).toHaveURL(/filterWhere=/);
        });
    });

    // URL Sync Tests
    test.describe('URL sync', () => {
        test('should update URL when filter is added', async ({ page }) => {
            const workerListPage = new WorkerListPage(page);

            await workerListPage.goto();

            // Apply a filter
            await workerListPage.filterWorkers(`Slug = 'test-worker'`);

            // Verify URL contains the filter param (filterWhere is the URL param name)
            await expect(page).toHaveURL(/filterWhere=/);
        });

        test('should restore filters from URL on page load', async ({ page }) => {
            // Navigate directly to URL with filter params (filterWhere is the URL param name)
            await page.goto('/bridge-workers?filterWhere=Slug%20%3D%20%27test-filter-worker%27');

            // Verify the filter is displayed in QueryBuilder (Clear all button should be visible)
            await expect(page.getByRole('button', { name: 'Clear all', exact: true })).toBeVisible();
        });

        test('should clear URL params when filters cleared', async ({ page }) => {
            // Start with filters in URL (filterWhere is the URL param name)
            await page.goto('/bridge-workers?filterWhere=Slug%20%3D%20%27test%27');

            // Wait for filter to be restored from URL
            await expect(page.getByRole('button', { name: 'Clear all', exact: true })).toBeVisible();

            // Clear filters
            const workerListPage = new WorkerListPage(page);
            await workerListPage.clearFilters();

            // Verify URL no longer contains filter params
            await expect(page).not.toHaveURL(/filterWhere=/);
        });

        test('should preserve filter state on page refresh', async ({ page }) => {
            const workerListPage = new WorkerListPage(page);

            await workerListPage.goto();

            // Apply a filter
            await workerListPage.filterWorkers(`Slug = 'refresh-test'`);

            // Wait for URL to update
            await expect(page).toHaveURL(/filterWhere=/);

            // Refresh the page
            await page.reload();

            // Verify the filter is still applied (Clear all button should be visible)
            await expect(page.getByRole('button', { name: 'Clear all', exact: true })).toBeVisible();
        });
    });
});
