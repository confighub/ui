// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { UnitDetailPage } from './fixtures/unit-details-page';
import { UnitListPage } from './fixtures/unit-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const deploymentType = 'todo-app-load-balancer';
const name = RandomSlugGenerator.randomSlugName();

test.describe('unit detail page', () => {
  test.use({ storageState: 'authentication.json' });

  test.beforeEach(async ({ page }) => {
    const unitListPage = new UnitListPage(page);
    await unitListPage.goto();
    await page.getByTestId('refresh-button').click();
    await unitListPage.goToUnitDetailPageByRowClick(name);
  });

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();

    const unitListPage = new UnitListPage(page);
    await unitListPage.createUnitViaAPI({ unitType: deploymentType, slug: name });

    await context.close();
  });

  // General Tests

  test('should display unit data', async ({ page }) => {
    const unitDetailPage = new UnitDetailPage(page);

    await unitDetailPage.expectToBeVisibleByText(name);

    // The configuration is not on the Unit -- the Config tab reads it from the Unit's data
    // endpoint -- so this is what proves it arrived, rather than that the page rendered.
    await page.getByRole('tab', { name: 'Config' }).click();
    await expect(page.getByText('Kubernetes/YAML Configuration')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('nginx-config').first()).toBeVisible({ timeout: 10000 });

    // The Revisions table names the user who made each revision; a regression
    // showed "Automated" in the Edited By column instead.
    await page.getByRole('tab', { name: 'Revisions' }).click();
    await expect(page.locator('[class*="MuiAvatar"]').first()).toBeVisible({ timeout: 5000 });
    expect(await page.textContent('body')).not.toContain('Automated');
  });

  // Function Invocation Tests

  // There is no dedicated results tab any more (the Function Invocations and
  // Attributes tabs were removed and nothing replaced them), so validation
  // pass/fail is asserted directly off the /function/invoke response instead
  // of off rendered UI text.

  // Success on a FunctionInvocationsResponse entry means only that the function executed
  // without error -- a vet-* function that detects a violation still reports Success: true.
  // The pass/fail verdict lives in the ValidationResult output, base64-encoded on the wire,
  // which decodes to a JSON array whose first entry carries Passed.
  const expectValidationFailed = (invocationResult: { Outputs?: Record<string, string> }) => {
    const encoded =
      invocationResult?.Outputs?.['ValidationResult'] ??
      invocationResult?.Outputs?.['ValidationResultList'];
    expect(encoded).toBeTruthy();
    const results = JSON.parse(Buffer.from(encoded as string, 'base64').toString('utf-8'));
    expect(results?.[0]?.Passed).toBe(false);
  };

  // A predicate that only checks the URL/method would accept the response of any
  // /function/invoke POST the page makes, not only the vet-* invocation the test
  // triggered by clicking Invoke. Matching on the request body's FunctionName pins the
  // wait to the invocation under test.
  const waitForFunctionInvokeResponse = (page: Page, functionName: string) =>
    page.waitForResponse((resp) => {
      if (!resp.url().includes('/function/invoke') || resp.request().method() !== 'POST') {
        return false;
      }
      const postData = resp.request().postData();
      return !!postData && postData.includes(`"FunctionName":"${functionName}"`);
    });

  test('should execute a validation function: vet-celexpr successfully', async ({ page }) => {
    const unitDetailPage = new UnitDetailPage(page);
    const functionName = 'vet-celexpr';

    const [response] = await Promise.all([
      waitForFunctionInvokeResponse(page, functionName),
      unitDetailPage.invokeFunctionByNameWithParameters({
        functionName,
        // `fullyParallel: true` (playwright.config.ts) means the 'set-replicas' test can
        // mutate this same shared unit's replicas concurrently with this test, so a
        // threshold like "replicas < 3" is not deterministic (the fixture starts at
        // replicas: 1, which already satisfies < 3 and would pass validation before any
        // mutation lands). "< 0" can never hold, so the Deployment always fails this
        // check regardless of its current replica count.
        params: [
          { name: 'validation-expr', value: 'r.kind != "Deployment" || r.spec.replicas < 0' },
        ],
      }),
    ]);

    // /function/invoke responds with a JSON array of FunctionInvocationsResponse,
    // one entry per unit invoked on.
    const body = await response.json();
    expectValidationFailed(body?.[0]);
  });

  test('should execute a mutation function: set-replicas', async ({ page }) => {
    const unitDetailPage = new UnitDetailPage(page);
    const functionName = 'set-replicas';

    await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/function/invoke') && resp.request().method() === 'POST',
      ),
      unitDetailPage.invokeFunctionByNameWithParameters({
        functionName,
        params: [{ name: 'Replicas', value: '5', type: 'number' }],
      }),
    ]);

    // Mutations recorded by the invocation still show up in the Mutations tab.
    await unitDetailPage.goToMutationsTab();
    await unitDetailPage.expectToBeVisibleByText(functionName);
  });
});
