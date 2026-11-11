// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { APIResponse } from '@playwright/test';

import { expect, hubApi, test } from './fixtures/test';

/**
 * The Validation page tracks a validating Trigger through its enforcement: selected in a Space while
 * it warns, it is in Audit with the Unit that fails it listed; its priority is set from the page;
 * and enforcing it from the page records when, and re-evaluates the Unit so its warning becomes a
 * ValidationError.
 */

const deployment = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27
`;

const LIMITS =
  "r.kind != 'Deployment' || r.spec.template.spec.containers.all(c, has(c.resources) && has(c.resources.limits))";

const body = async <T>(response: APIResponse, what: string): Promise<T> => {
  if (!response.ok())
    throw new Error(`${what}: ${response.status()} ${await response.text()}`);
  return (await response.json()) as T;
};

test.describe('the Validation page', () => {
  let policySpaceId = '';
  let policySlug = '';
  let appSpaceId = '';
  let triggerId = '';
  let unitId = '';
  let ruleSlug = '';

  const trigger = async () =>
    (
      await body<{ Trigger: { Warn?: boolean; Annotations?: Record<string, string> } }>(
        await hubApi.get(`/api/space/${policySpaceId}/trigger/${triggerId}`),
        'trigger',
      )
    ).Trigger;
  const unitGates = async () => {
    const { Unit } = await body<{
      Unit: {
        ValidationErrors?: Record<string, boolean>;
        ValidationWarnings?: Record<string, boolean>;
      };
    }>(await hubApi.get(`/api/space/${appSpaceId}/unit/${unitId}`), 'unit');
    return {
      errors: Object.keys(Unit.ValidationErrors ?? {}),
      warnings: Object.keys(Unit.ValidationWarnings ?? {}),
    };
  };

  test.beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    policySlug = `validation-policy-${suffix}`;
    // Unique, so the cards of tests running at once are told apart.
    ruleSlug = `needs-limits-${suffix}`;
    policySpaceId = (
      await body<{ SpaceID: string }>(
        await hubApi.post('/api/space', {
          data: { Slug: policySlug, Labels: { Owner: 'E2E' } },
        }),
        'policy space',
      )
    ).SpaceID;
    triggerId = (
      await body<{ TriggerID: string }>(
        await hubApi.post(`/api/space/${policySpaceId}/trigger`, {
          data: {
            Slug: ruleSlug,
            Description: 'Every container sets resources.limits.',
            Event: 'Mutation',
            ToolchainType: 'Kubernetes/YAML',
            FunctionName: 'vet-cel',
            Arguments: [{ ParameterName: 'expression', Value: LIMITS }],
            Warn: true,
            Annotations: { Priority: 'High' },
            WhereResource: `metadata.annotations.exceptions~1guardrails~1confighub~1com/${ruleSlug} IS NULL`,
          },
        }),
        'trigger',
      )
    ).TriggerID;
    appSpaceId = (
      await body<{ SpaceID: string }>(
        await hubApi.post('/api/space', {
          data: {
            Slug: `validation-app-${suffix}`,
            Labels: { Owner: 'E2E' },
            WhereTrigger: `Space.Slug = '${policySlug}'`,
          },
        }),
        'app space',
      )
    ).SpaceID;
    unitId = (
      await body<{ Unit: { UnitID: string } }>(
        await hubApi.post(`/api/space/${appSpaceId}/unit`, {
          data: { Slug: 'web', ToolchainType: 'Kubernetes/YAML' },
        }),
        'unit',
      )
    ).Unit.UnitID;
    await body(
      await hubApi.put(`/api/space/${appSpaceId}/unit/${unitId}/data`, { data: deployment }),
      'unit data',
    );
    await expect
      .poll(async () => (await unitGates()).warnings.length, { timeout: 20000 })
      .toBe(1);
  });

  test.afterEach(async () => {
    for (const id of [appSpaceId, policySpaceId]) {
      if (id)
        await hubApi
          .delete(`/api/space/${id}`, { params: { recursive: 'true' } })
          .catch(() => undefined);
    }
  });

  test('tracks a Trigger from Audit to Enforced', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto(`/validation/${triggerId}`);

    // In Audit, with its card on the board and the failing Unit listed.
    await expect(
      page.getByTestId('validation-column-Audited').getByTestId(`validation-card-${ruleSlug}`),
    ).toBeVisible({
      timeout: 20000,
    });
    const detail = page.getByTestId('validation-detail');
    await expect(detail.getByTestId('validation-stage')).toHaveText('Audited');
    await expect(detail.getByRole('button', { name: 'Failing (1)' })).toBeVisible();
    await expect(
      detail.getByTestId('validation-unit-row').filter({ hasText: 'web' }),
    ).toBeVisible();

    // Priority is set from the page.
    await detail.getByTestId('validation-priority').click();
    await page.getByRole('option', { name: 'Low', exact: true }).click();
    await expect.poll(async () => (await trigger()).Annotations?.Priority).toBe('Low');

    // Enforcing asks first, says what it will block, records when, and re-evaluates the Unit.
    await detail.getByTestId('validation-mode-enforce').click();
    const dialog = page.getByRole('dialog', { name: 'Enforce this Trigger?' });
    await expect(dialog).toContainText('1 Unit now warned by it will be blocked.');
    await dialog.getByTestId('validation-mode-confirm').click();
    await expect.poll(async () => (await trigger()).Warn ?? false).toBe(false);
    expect((await trigger()).Annotations?.EnforcedAt).toBeTruthy();
    await expect
      .poll(async () => (await unitGates()).errors.length, { timeout: 20000 })
      .toBe(1);
    expect((await unitGates()).warnings).toEqual([]);

    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(detail.getByTestId('validation-stage')).toHaveText('Enforced', {
      timeout: 20000,
    });

    // Returning to audit runs the Trigger again on the Unit it fails, which turns the gate
    // blocking it back into a warning.
    await detail.getByTestId('validation-mode-audit').click();
    const auditDialog = page.getByRole('dialog', { name: 'Return to audit?' });
    await expect(auditDialog).toContainText('The Trigger runs again on the 1 Unit it fails.');
    await auditDialog.getByTestId('validation-mode-confirm').click();
    await expect.poll(async () => (await trigger()).Warn ?? false).toBe(true);
    await expect
      .poll(async () => (await unitGates()).warnings.length, { timeout: 20000 })
      .toBe(1);
    expect((await unitGates()).errors).toEqual([]);
  });

  test('excepts a failing resource, and removes the exception', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto(`/validation/${triggerId}`);
    const detail = page.getByTestId('validation-detail');
    const row = detail.getByTestId('validation-unit-row').filter({ hasText: 'web' });
    await row.getByRole('button', { name: 'Except…' }).click({ timeout: 20000 });

    const dialog = page.getByTestId('exception-dialog');
    await dialog
      .getByTestId('exception-reason')
      .locator('textarea')
      .first()
      .fill('Sized by its autoscaler');
    await dialog.getByTestId('exception-submit').click();
    await expect(dialog).toHaveCount(0);

    // The resource carries the exception, and the Trigger no longer warns on it.
    await expect
      .poll(async () => (await unitGates()).warnings.length, { timeout: 20000 })
      .toBe(0);
    const exceptions = detail.getByTestId('validation-exceptions');
    await expect(exceptions).toContainText('Sized by its autoscaler');

    await exceptions.getByRole('button', { name: 'Remove…' }).click();
    await page.getByTestId('exception-dialog').getByTestId('exception-submit').click();
    await expect
      .poll(async () => (await unitGates()).warnings.length, { timeout: 20000 })
      .toBe(1);
  });
});
